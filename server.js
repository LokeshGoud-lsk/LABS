const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();

const PORT = 3000;

app.use(cors());

app.use(express.json({ limit: "5mb" }));

app.use(express.static(__dirname));


// ======================================================
// SIMPLE JSON DATABASE
// ======================================================

const DB_FILE = path.join(__dirname, "database.json");

function createDatabase(){

    if(!fs.existsSync(DB_FILE)){

        const database = {

            users:[
                {
                    id:"USR-001",
                    name:"Demo Admin",
                    email:"admin@demo.local",
                    password:"ChangeMe123!",
                    role:"Administrator"
                },
                {
                    id:"USR-002",
                    name:"Dr. Ananya",
                    email:"doctor@demo.local",
                    password:"ChangeMe123!",
                    role:"Practitioner"
                },
                {
                    id:"USR-003",
                    name:"Demo Reception",
                    email:"reception@demo.local",
                    password:"ChangeMe123!",
                    role:"Receptionist"
                }
            ],

            patients:[],

            cases:[],

            appointments:[],

            followups:[],

            treatments:[],

            auditLogs:[]

        };

        fs.writeFileSync(
            DB_FILE,
            JSON.stringify(database,null,2)
        );

    }

}

createDatabase();


function readDB(){

    return JSON.parse(
        fs.readFileSync(DB_FILE,"utf8")
    );

}


function writeDB(data){

    fs.writeFileSync(
        DB_FILE,
        JSON.stringify(data,null,2)
    );

}


function id(prefix){

    return (
        prefix+
        "-"+
        crypto
            .randomBytes(5)
            .toString("hex")
            .toUpperCase()
    );

}


function audit(
    user,
    action,
    resource,
    resourceId
){

    const db=readDB();

    db.auditLogs.push({

        id:id("AUD"),

        user:user || "SYSTEM",

        action,

        resource,

        resourceId,

        timestamp:
            new Date().toISOString()

    });

    writeDB(db);

}


// ======================================================
// HEALTH
// ======================================================

app.get("/api/health",(req,res)=>{

    res.json({

        status:"OK",

        application:
            "AYUSH Patient Case System",

        time:
            new Date().toISOString()

    });

});


// ======================================================
// LOGIN
// ======================================================

app.post("/api/login",(req,res)=>{

    const {
        email,
        password
    }=req.body;

    const db=readDB();

    const user=
        db.users.find(
            u=>
                u.email.toLowerCase()
                ===
                String(email).toLowerCase()
                &&
                u.password===password
        );

    if(!user){

        return res.status(401).json({

            message:
                "Invalid email or password"

        });

    }

    const token=
        crypto
        .randomBytes(32)
        .toString("hex");

    audit(
        user.email,
        "LOGIN",
        "USER",
        user.id
    );

    res.json({

        message:"Login successful",

        token,

        user:{
            id:user.id,
            name:user.name,
            email:user.email,
            role:user.role
        }

    });

});


// ======================================================
// PATIENTS
// ======================================================

app.get("/api/patients",(req,res)=>{

    const db=readDB();

    let patients=db.patients;

    const search=
        String(req.query.search || "")
        .toLowerCase();

    if(search){

        patients=
            patients.filter(p=>

                (
                    p.name+
                    p.id+
                    p.mobile+
                    p.email
                )
                .toLowerCase()
                .includes(search)

            );

    }

    res.json({

        total:patients.length,

        patients

    });

});


app.get("/api/patients/:id",(req,res)=>{

    const db=readDB();

    const patient=
        db.patients.find(
            p=>p.id===req.params.id
        );

    if(!patient){

        return res.status(404).json({

            message:"Patient not found"

        });

    }

    const cases=
        db.cases.filter(
            c=>c.patientId===patient.id
        );

    const followups=
        db.followups.filter(
            f=>f.patientId===patient.id
        );

    res.json({

        patient,

        cases,

        followups

    });

});


app.post("/api/patients",(req,res)=>{

    const db=readDB();

    const {

        name,
        age,
        gender,
        mobile,
        email,
        occupation,
        city,
        state,
        address

    }=req.body;


    if(!name || !mobile){

        return res.status(400).json({

            message:
                "Name and mobile are required"

        });

    }


    // DUPLICATE DETECTION

    const duplicate=
        db.patients.find(p=>

            p.mobile===mobile
            ||
            (
                email &&
                p.email===email
            )
            ||
            (
                p.name.toLowerCase()
                ===
                name.toLowerCase()
                &&
                String(p.age)
                ===
                String(age)
            )

        );


    if(duplicate){

        return res.status(409).json({

            message:
                "Possible existing patient found",

            existingPatient:duplicate

        });

    }


    const patient={

        id:
            "AYU-"+
            new Date().getFullYear()+
            "-"+
            String(
                db.patients.length+1
            ).padStart(6,"0"),

        name,

        age,

        gender,

        mobile,

        email,

        occupation,

        city,

        state,

        address,

        registrationDate:
            new Date().toISOString(),

        status:"Active"

    };


    db.patients.push(patient);

    writeDB(db);


    audit(
        "SYSTEM",
        "PATIENT_REGISTERED",
        "PATIENT",
        patient.id
    );


    res.status(201).json({

        message:
            "Patient registered successfully",

        patient

    });

});


// ======================================================
// UPDATE PATIENT
// ======================================================

app.put("/api/patients/:id",(req,res)=>{

    const db=readDB();

    const index=
        db.patients.findIndex(
            p=>p.id===req.params.id
        );

    if(index===-1){

        return res.status(404).json({

            message:"Patient not found"

        });

    }

    db.patients[index]={

        ...db.patients[index],

        ...req.body,

        id:req.params.id,

        updatedAt:
            new Date().toISOString()

    };

    writeDB(db);


    audit(
        "SYSTEM",
        "PATIENT_UPDATED",
        "PATIENT",
        req.params.id
    );


    res.json({

        message:
            "Patient updated successfully",

        patient:
            db.patients[index]

    });

});


// ======================================================
// CREATE CASE
// ======================================================

app.post("/api/cases",(req,res)=>{

    const db=readDB();

    const patient=
        db.patients.find(
            p=>p.id===req.body.patientId
        );


    if(!patient){

        return res.status(404).json({

            message:"Patient not found"

        });

    }


    const caseRecord={

        id:id("CASE"),

        patientId:
            req.body.patientId,

        caseDate:
            req.body.caseDate
            ||
            new Date().toISOString(),

        status:
            req.body.status
            ||
            "Draft",

        completeness:
            req.body.completeness
            ||
            0,

        data:
            req.body.data
            ||
            {},

        createdAt:
            new Date().toISOString(),

        updatedAt:
            new Date().toISOString()

    };


    db.cases.push(caseRecord);

    writeDB(db);


    audit(
        "SYSTEM",
        "CASE_CREATED",
        "CASE",
        caseRecord.id
    );


    res.status(201).json({

        message:"Case created",

        case:caseRecord

    });

});


// ======================================================
// GET CASE
// ======================================================

app.get("/api/cases",(req,res)=>{

    const db=readDB();

    let cases=db.cases;

    if(req.query.patientId){

        cases=
            cases.filter(
                c=>
                    c.patientId
                    ===
                    req.query.patientId
            );

    }

    res.json({

        total:cases.length,

        cases

    });

});


app.get("/api/cases/:id",(req,res)=>{

    const db=readDB();

    const caseRecord=
        db.cases.find(
            c=>c.id===req.params.id
        );

    if(!caseRecord){

        return res.status(404).json({

            message:"Case not found"

        });

    }

    res.json(caseRecord);

});


// ======================================================
// UPDATE CASE
// ======================================================

app.put("/api/cases/:id",(req,res)=>{

    const db=readDB();

    const index=
        db.cases.findIndex(
            c=>c.id===req.params.id
        );

    if(index===-1){

        return res.status(404).json({

            message:"Case not found"

        });

    }

    db.cases[index]={

        ...db.cases[index],

        ...req.body,

        updatedAt:
            new Date().toISOString()

    };

    writeDB(db);


    audit(
        "SYSTEM",
        "CASE_UPDATED",
        "CASE",
        req.params.id
    );


    res.json({

        message:"Case updated",

        case:
            db.cases[index]

    });

});


// ======================================================
// APPOINTMENTS
// ======================================================

app.get("/api/appointments",(req,res)=>{

    const db=readDB();

    res.json({

        appointments:
            db.appointments

    });

});


app.post("/api/appointments",(req,res)=>{

    const db=readDB();

    const appointment={

        id:id("APT"),

        patientId:
            req.body.patientId,

        practitionerId:
            req.body.practitionerId,

        date:
            req.body.date,

        time:
            req.body.time,

        type:
            req.body.type
            ||
            "Consultation",

        status:
            "Scheduled",

        createdAt:
            new Date().toISOString()

    };


    db.appointments.push(
        appointment
    );

    writeDB(db);


    audit(
        "SYSTEM",
        "APPOINTMENT_CREATED",
        "APPOINTMENT",
        appointment.id
    );


    res.status(201).json({

        message:
            "Appointment created",

        appointment

    });

});


// ======================================================
// FOLLOW UPS
// ======================================================

app.get("/api/followups",(req,res)=>{

    const db=readDB();

    res.json({

        followups:
            db.followups

    });

});


app.post("/api/followups",(req,res)=>{

    const db=readDB();

    const followup={

        id:id("FUP"),

        patientId:
            req.body.patientId,

        caseId:
            req.body.caseId,

        date:
            req.body.date,

        status:
            req.body.status
            ||
            "Upcoming",

        notes:
            req.body.notes
            ||
            "",

        createdAt:
            new Date().toISOString()

    };


    db.followups.push(
        followup
    );

    writeDB(db);


    audit(
        "SYSTEM",
        "FOLLOWUP_CREATED",
        "FOLLOWUP",
        followup.id
    );


    res.status(201).json({

        message:
            "Follow-up created",

        followup

    });

});


// ======================================================
// TREATMENTS
// ======================================================

app.get("/api/treatments",(req,res)=>{

    const db=readDB();

    res.json({

        treatments:
            db.treatments

    });

});


app.post("/api/treatments",(req,res)=>{

    const db=readDB();

    const treatment={

        id:id("TRT"),

        patientId:
            req.body.patientId,

        caseId:
            req.body.caseId,

        treatmentName:
            req.body.treatmentName,

        treatmentType:
            req.body.treatmentType,

        instructions:
            req.body.instructions,

        frequency:
            req.body.frequency,

        duration:
            req.body.duration,

        startDate:
            req.body.startDate,

        endDate:
            req.body.endDate,

        practitionerNotes:
            req.body.practitionerNotes,

        createdAt:
            new Date().toISOString()

    };


    db.treatments.push(
        treatment
    );

    writeDB(db);


    audit(
        "SYSTEM",
        "TREATMENT_CREATED",
        "TREATMENT",
        treatment.id
    );


    res.status(201).json({

        message:
            "Treatment documentation saved",

        treatment

    });

});


// ======================================================
// SMART AUTOMATION
// ======================================================

app.post("/api/automation/completeness",
(req,res)=>{

    const data=req.body || {};

    const required=[

        "patient",

        "complaints",

        "history",

        "medicalHistory",

        "lifestyle",

        "symptoms",

        "examination",

        "assessment",

        "treatment",

        "followup"

    ];


    let completed=0;

    const missing=[];


    required.forEach(field=>{

        if(
            data[field] !== undefined
            &&
            data[field] !== null
            &&
            String(data[field]).trim()!==""
        ){

            completed++;

        }else{

            missing.push(field);

        }

    });


    const score=
        Math.round(
            completed/
            required.length*
            100
        );


    res.json({

        completeness:score,

        missingFields:missing,

        message:
            score===100
            ?
            "Documentation complete"
            :
            "Some documentation is missing"

    });

});


// ======================================================
// CASE SUMMARY
// ======================================================

app.post("/api/automation/summary",
(req,res)=>{

    const d=req.body || {};

    const summary=`

Patient Case Documentation Summary

Patient:
${d.patient || "Not documented"}

Chief Complaints:
${d.complaints || "Not documented"}

History:
${d.history || "Not documented"}

Lifestyle:
${d.lifestyle || "Not documented"}

Symptoms:
${d.symptoms || "Not documented"}

Examination:
${d.examination || "Not documented"}

AYUSH Assessment:
${d.ayushAssessment || "Not documented"}

Practitioner Assessment:
${d.assessment || "Not documented"}

Treatment Documentation:
${d.treatment || "Not documented"}

Follow-up:
${d.followup || "Not documented"}

NOTE:
This is an automatically generated documentation
summary. It must be reviewed and verified by a
qualified practitioner.

`;


    res.json({

        summary,

        disclaimer:
            "AI-generated content is provided for documentation assistance only. It must be reviewed and verified by a qualified practitioner."

    });

});


// ======================================================
// DASHBOARD
// ======================================================

app.get("/api/dashboard/stats",(req,res)=>{

    const db=readDB();

    const today=
        new Date()
        .toISOString()
        .split("T")[0];


    const appointmentsToday=
        db.appointments.filter(
            a=>
                String(a.date)
                .startsWith(today)
        ).length;


    const followupsDue=
        db.followups.filter(
            f=>
                f.status==="Due"
                ||
                f.status==="Upcoming"
        ).length;


    res.json({

        totalPatients:
            db.patients.length,

        newPatientsToday:
            db.patients.filter(
                p=>
                    p.registrationDate
                    &&
                    p.registrationDate
                    .startsWith(today)
            ).length,

        activeCases:
            db.cases.filter(
                c=>c.status!=="Completed"
            ).length,

        followupsDue,

        appointmentsToday,

        completedConsultations:
            db.cases.filter(
                c=>c.status==="Completed"
            ).length,

        pendingCases:
            db.cases.filter(
                c=>c.status==="Draft"
            ).length

    });

});


// ======================================================
// AUDIT LOGS
// ======================================================

app.get("/api/audit-logs",(req,res)=>{

    const db=readDB();

    res.json({

        logs:
            db.auditLogs
            .slice()
            .reverse()

    });

});


// ======================================================
// ADMIN USERS
// ======================================================

app.get("/api/users",(req,res)=>{

    const db=readDB();

    res.json({

        users:
            db.users.map(u=>({

                id:u.id,

                name:u.name,

                email:u.email,

                role:u.role

            }))

    });

});


// ======================================================
// REPORT DATA
// ======================================================

app.get("/api/reports/patient/:id",
(req,res)=>{

    const db=readDB();

    const patient=
        db.patients.find(
            p=>p.id===req.params.id
        );

    if(!patient){

        return res.status(404).json({

            message:"Patient not found"

        });

    }


    res.json({

        patient,

        cases:
            db.cases.filter(
                c=>
                    c.patientId
                    ===
                    patient.id
            ),

        followups:
            db.followups.filter(
                f=>
                    f.patientId
                    ===
                    patient.id
            ),

        treatments:
            db.treatments.filter(
                t=>
                    t.patientId
                    ===
                    patient.id
            )

    });

});


// ======================================================
// START SERVER
// ======================================================

app.listen(PORT,()=>{

    console.log("");
    console.log("======================================");
    console.log(" AYUSH PATIENT CASE SYSTEM");
    console.log("======================================");
    console.log("");
    console.log(
        `Frontend: http://localhost:${PORT}`
    );
    console.log(
        `Backend:  http://localhost:${PORT}/api`
    );
    console.log("");
    console.log("Demo accounts:");
    console.log("admin@demo.local");
    console.log("doctor@demo.local");
    console.log("reception@demo.local");
    console.log("Password: ChangeMe123!");
    console.log("");
    console.log("======================================");

});