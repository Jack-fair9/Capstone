const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const { GridFSBucket } = require('mongodb');
const nodemailer = require('nodemailer');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public'))); 


const mongoURI = "mongodb+srv://arshdeepkhurana3:Arshdeep00%40@needle.j6dcl.mongodb.net/Needle?retryWrites=true&w=majority";
mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('Connected to MongoDB Atlas'))
    .catch(err => console.error('Failed to connect to MongoDB:', err));


const conn = mongoose.connection;
let gfs;
conn.once('open', () => {
    gfs = new GridFSBucket(conn.db, { bucketName: 'uploads' });
    console.log('GridFS initialized');
});

// Schemas
const userSchema = new mongoose.Schema({
    firstName: String,
    lastName: String,
    email: { type: String, unique: true },
    phoneNumber: String,
    password: String
});
const User = mongoose.model('User', userSchema);

const employerCredentialsSchema = new mongoose.Schema({
    email: { type: String, unique: true },
    password: String
}, { collection: 'employeracc' });
const EmployerCredentials = mongoose.model('EmployerCredentials', employerCredentialsSchema);


const storage = multer.memoryStorage();
const upload = multer({ storage });


const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: "your-email@gmail.com", 
        pass: "your-email-password"  
    }
});


function sendWelcomeEmail(email, name) {
    const mailOptions = {
        from: "your-email@gmail.com",
        to: email,
        subject: "Welcome to Needle",
        text: `Hello ${name}, welcome to Needle! We're glad to have you here.`
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.log('Email error:', error);
        } else {
            console.log('Email sent:', info.response);
        }
    });
}


app.post('/signup', async (req, res) => {
    const { firstName, lastName, email, phoneNumber, password } = req.body;
    if (!firstName || !lastName || !email || !phoneNumber || !password) {
        return res.status(400).json({ message: 'All fields are required!' });
    }
    try {
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: 'Email is already registered.' });
        }
        const newUser = new User({ firstName, lastName, email, phoneNumber, password });
        await newUser.save();
        sendWelcomeEmail(email, firstName); 
        res.status(201).json({ message: 'User registered successfully!' });
    } catch (err) {
        console.error('Error during signup:', err);
        res.status(500).json({ message: 'Failed to register user. Please try again.' });
    }
});


app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required!' });
    }
    try {
        const user = await User.findOne({ email });
        if (!user || user.password !== password) {
            return res.status(400).json({ message: 'Invalid email or password.' });
        }
        res.status(200).json({ message: 'Login successful!' });
    } catch (err) {
        console.error('Error during login:', err);
        res.status(500).json({ message: 'Server error. Please try again later.' });
    }
});


app.post('/employer-signup', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required!' });
    }
    try {
        const existingEmployer = await EmployerCredentials.findOne({ email });
        if (existingEmployer) {
            return res.status(400).json({ message: 'Employer with this email already exists.' });
        }
        const newEmployer = new EmployerCredentials({ email, password });
        await newEmployer.save();
        res.status(201).json({ message: 'Employer registered successfully!' });
    } catch (err) {
        console.error('Error during employer signup:', err);
        res.status(500).json({ message: 'Failed to register employer. Please try again.' });
    }
});


app.post('/employer-login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required!' });
    }
    try {
        const employer = await EmployerCredentials.findOne({ email });
        if (!employer || employer.password !== password) {
            return res.status(400).json({ message: 'Invalid email or password.' });
        }
        res.status(200).json({ message: 'Employer login successful!' });
    } catch (err) {
        console.error('Error during employer login:', err);
        res.status(500).json({ message: 'Server error. Please try again later.' });
    }
});


app.post('/upload-job', upload.fields([
    { name: 'resume', maxCount: 1 },
    { name: 'coverletter', maxCount: 1 }
]), async (req, res) => {
    const { name, email } = req.body;
    const files = req.files;

    if (!name || !email || !files || !files.resume) {
        return res.status(400).json({ message: 'Name, email, and resume are required!' });
    }
    try {
        const resumeFile = files.resume[0];
        const coverLetterFile = files.coverletter ? files.coverletter[0] : null;

        const resumeStream = gfs.openUploadStream(`${Date.now()}-resume.pdf`, {
            contentType: resumeFile.mimetype,
            metadata: { name, email, type: 'resume' }
        });
        resumeStream.end(resumeFile.buffer);

        if (coverLetterFile) {
            const coverLetterStream = gfs.openUploadStream(`${Date.now()}-coverletter.pdf`, {
                contentType: coverLetterFile.mimetype,
                metadata: { name, email, type: 'coverletter' }
            });
            coverLetterStream.end(coverLetterFile.buffer);
        }

        res.status(200).json({ message: 'Job application uploaded successfully!' });
    } catch (err) {
        console.error('Error uploading file:', err);
        res.status(500).json({ message: 'Failed to upload job application.' });
    }
});


app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
