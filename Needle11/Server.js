const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const { GridFSBucket } = require('mongodb');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const multer = require('multer');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Multer configuration for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// MongoDB Connection
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

// Helper function to upload files to GridFS
const uploadFileToGridFS = (file) => {
    return new Promise((resolve, reject) => {
        if (!file) {
            reject(new Error('No file provided'));
            return;
        }

        const uploadStream = gfs.openUploadStream(file.originalname, {
            contentType: file.mimetype
        });

        uploadStream.write(file.buffer);
        uploadStream.end((err) => {
            if (err) {
                reject(err);
                return;
            }
            resolve({
                id: uploadStream.id,
                name: file.originalname
            });
        });
    });
};

// User Schema
const userSchema = new mongoose.Schema({
    firstName: String,
    lastName: String,
    email: { type: String, unique: true },
    phoneNumber: String,
    password: String,
    resetPasswordOTP: String,
    resetPasswordToken: String,
    resetPasswordExpires: Date
});
const User = mongoose.model('User', userSchema);

// Employer Schema
const employerCredentialsSchema = new mongoose.Schema({
    email: { type: String, unique: true },
    password: String,
    isVerified: { type: Boolean, default: false },
    authCode: { type: String, default: null },
    resetPasswordOTP: String,
    resetPasswordToken: String,
    resetPasswordExpires: Date
}, { collection: 'employeracc' });
const EmployerCredentials = mongoose.model('EmployerCredentials', employerCredentialsSchema);

// Employee Schema
const employeeSchema = new mongoose.Schema({
    firstName: String,
    lastName: String,
    phoneNumber: String,
    companyName: String,
    companyEmail: { type: String },
    joiningDate: Date,
    department: String,
    position: String,
    email: String,
    password: String,
    emoji: { type: String, default: '👤' },
    status: { type: String, default: 'active' },
    profilePicture: {
        data: Buffer,
        contentType: String
    },
    resetPasswordToken: String,
    resetPasswordExpires: Date
});
const Employee = mongoose.model('Employee', employeeSchema);

// Job Posting Schema
const jobPostingSchema = new mongoose.Schema({
    title: String,
    description: String,
    department: String,
    company: String,
    postedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'EmployerCredentials' },
    createdAt: { type: Date, default: Date.now },
    applicants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'JobApplication' }]
});
const JobPosting = mongoose.model('JobPosting', jobPostingSchema);

// Job Application Schema
const jobApplicationSchema = new mongoose.Schema({
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'JobPosting' },
    name: String,
    email: String,
    resumeId: mongoose.Schema.Types.ObjectId,
    resumeType: String,
    resumeName: String,
    coverLetterId: mongoose.Schema.Types.ObjectId,
    coverLetterType: String,
    coverLetterName: String,
    referral: String,
    status: { type: String, default: 'Submitted' },
    appliedAt: { type: Date, default: Date.now }
});
const JobApplication = mongoose.model('JobApplication', jobApplicationSchema);

// Nodemailer Transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'Needle.info1@gmail.com',
        pass: 'lqdv rhgm kiag vppz'
    }
});

// Email Sending Helper Function
const sendEmail = async (to, subject, text) => {
    const mailOptions = {
        from: 'Needle <Needle.info1@gmail.com>',
        to,
        subject,
        text
    };
    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('Email sent successfully:', info.response);
    } catch (err) {
        console.error('Error sending email:', err.message);
        throw err;
    }
};

// Routes

// File download endpoint
app.get('/api/download/:fileId', async (req, res) => {
    try {
        const fileId = new mongoose.Types.ObjectId(req.params.fileId);
        const files = await gfs.find({ _id: fileId }).toArray();

        if (files.length === 0) {
            return res.status(404).json({ message: 'File not found' });
        }

        const file = files[0];
        const filename = file.filename;
        
        // Set proper headers for file download
        res.set({
            'Content-Type': file.contentType,
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Content-Length': file.length
        });

        // Stream the file to the client
        const downloadStream = gfs.openDownloadStream(file._id);
        downloadStream.pipe(res);

    } catch (err) {
        console.error('Download error:', err);
        res.status(500).json({ 
            message: 'Failed to download file', 
            error: err.message 
        });
    }
});

// User Signup
app.post('/signup', async (req, res) => {
    const { firstName, lastName, email, phoneNumber, password } = req.body;
    if (!firstName || !lastName || !email || !phoneNumber || !password) {
        return res.status(400).json({ message: 'All fields are required!' });
    }
    try {
        if (await User.findOne({ email: email.toLowerCase() })) {
            return res.status(400).json({ message: 'Email is already registered.' });
        }
        await new User({ firstName, lastName, email: email.toLowerCase(), phoneNumber, password }).save();
        await sendEmail(email, 'Welcome to Needle!', `Thank you for signing up, ${firstName}!\n\nBest regards,\nTeam Needle`);
        res.status(201).json({ message: 'User registered successfully!' });
    } catch (err) {
        res.status(500).json({ message: 'Failed to register user.', error: err.message });
    }
});

// User Login
app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required' });
    }

    try {
        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        if (user.password !== password) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        res.status(200).json({
            message: 'Login successful',
            user: {
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                phoneNumber: user.phoneNumber
            }
        });
    } catch (err) {
        res.status(500).json({ message: 'Login failed', error: err.message });
    }
});

// Employer Signup with Email Confirmation & Code
app.post('/employer-signup', async (req, res) => {
    const { email, password, companyName } = req.body;
    if (!email || !password || !companyName) {
        return res.status(400).json({ message: 'Email, password, and company name are required!' });
    }
    try {
        const existingEmployer = await EmployerCredentials.findOne({ email: email.toLowerCase() });
        if (existingEmployer) {
            return res.status(400).json({ message: 'Employer already exists.' });
        }

        const authCode = crypto.randomInt(100000, 999999).toString();
        const newEmployer = new EmployerCredentials({ email: email.toLowerCase(), password, authCode });
        await newEmployer.save();

        const verificationLink = `http://localhost:${PORT}/auth.html?email=${email}`;

        const mailContent = `
            Thank you for signing up with Needle!

            Your verification code is: ${authCode}

            Please verify your account to gain access to employer features. Click the link below to verify your account:

            ${verificationLink}

            If you did not sign up for Needle, please ignore this email.

            Best regards,
            The Needle Team
        `;
        await sendEmail(email, 'Verification Code and Account Confirmation - Needle', mailContent);

        res.status(201).json({ message: 'Employer registered successfully! Please verify your email.' });
    } catch (err) {
        res.status(500).json({ message: 'Failed to register employer.', error: err.message });
    }
});

// Employee Registration
app.post('/register-employee', async (req, res) => {
    const { firstName, lastName, phoneNumber, companyName, companyEmail, joiningDate, department, position, email, password, emoji } = req.body;

    if (!firstName || !lastName || !phoneNumber || !companyName || !companyEmail || !joiningDate || !department || !position || !email || !password) {
        return res.status(400).json({ message: 'All fields are required!' });
    }

    try {
        const newEmployee = new Employee({
            firstName,
            lastName,
            phoneNumber,
            companyName,
            companyEmail: companyEmail.toLowerCase(),
            joiningDate,
            department,
            position,
            email,
            password,
            emoji
        });

        await newEmployee.save();

        res.status(201).json({ message: 'Employee registered successfully!', employee: newEmployee });
    } catch (err) {
        res.status(500).json({ message: 'Failed to register employee.', error: err.message });
    }
});

// Employee Login
app.post('/api/employees/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required'
            });
        }

        const employee = await Employee.findOne({ email: email.toLowerCase() });

        if (!employee) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        if (employee.password !== password) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        let profilePicture = null;
        if (employee.profilePicture && employee.profilePicture.data) {
            profilePicture = {
                data: employee.profilePicture.data.toString('base64'),
                contentType: employee.profilePicture.contentType
            };
        }

        const employeeData = {
            id: employee._id,
            email: employee.email,
            companyName: employee.companyName,
            companyEmail: employee.companyEmail,
            joiningDate: employee.joiningDate,
            department: employee.department,
            position: employee.position,
            profilePicture: profilePicture,
            firstName: employee.firstName,
            lastName: employee.lastName,
            phoneNumber: employee.phoneNumber,
            emoji: employee.emoji,
            status: employee.status
        };

        res.status(200).json({
            success: true,
            message: 'Login successful',
            token: crypto.randomBytes(32).toString('hex'),
            employee: employeeData
        });

    } catch (err) {
        res.status(500).json({
            success: false,
            message: 'Login failed',
            error: err.message
        });
    }
});

// Code Verification Endpoint
app.post('/verify-code', async (req, res) => {
    const { email, authCode } = req.body;
    if (!email || !authCode) {
        return res.status(400).json({ message: 'Email and authentication code are required!' });
    }
    try {
        const employer = await EmployerCredentials.findOne({ email: email.toLowerCase() });
        if (!employer || employer.authCode !== authCode) {
            return res.status(400).json({ message: 'Invalid authentication code!' });
        }

        employer.authCode = null;
        employer.isVerified = true;
        await employer.save();

        res.status(200).json({ message: 'Account verified successfully! You can now log in.' });
    } catch (err) {
        res.status(500).json({ message: 'Code verification failed.', error: err.message });
    }
});

// Employer Login
app.post('/employer-login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required!' });
    }

    try {
        const employer = await EmployerCredentials.findOne({ email: email.toLowerCase() });

        if (!employer) {
            return res.status(400).json({ message: 'Invalid email or password.' });
        }

        if (!employer.isVerified) {
            return res.status(403).json({ message: 'Account not verified. Please verify your email before logging in.' });
        }

        if (employer.password !== password) {
            return res.status(400).json({ message: 'Invalid email or password.' });
        }

        res.status(200).json({ message: 'Login successful!' });
    } catch (err) {
        res.status(500).json({ message: 'Something went wrong.', error: err.message });
    }
});

app.get('/api/employees', async (req, res) => {
    try {
        console.log('Fetching all employees...');
        const employees = await Employee.find().select('-password -resetPasswordToken -resetPasswordExpires');
        console.log('Fetched employees:', employees);
        res.status(200).json({
            success: true,
            employees: employees
        });
    } catch (err) {
        console.error('Error fetching employees:', err);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch employees',
            error: err.message
        });
    }
});

// Forgot Password - Generate and send OTP
app.post('/forgot-password', async (req, res) => {
    const { email, userType } = req.body;

    if (!email || !userType) {
        return res.status(400).json({
            success: false,
            message: 'Email and user type are required'
        });
    }

    try {
        let user;
        if (userType === 'user') {
            user = await User.findOne({ email: email.toLowerCase() });
        } else if (userType === 'employer') {
            user = await EmployerCredentials.findOne({ email: email.toLowerCase() });
        } else if (userType === 'employee') {
            user = await Employee.findOne({ email: email.toLowerCase() });
        } else {
            return res.status(400).json({
                success: false,
                message: 'Invalid user type'
            });
        }

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Email not found'
            });
        }

        // Generate 6-digit OTP
        const otp = crypto.randomInt(100000, 999999).toString();
        const otpExpiry = Date.now() + 15 * 60 * 1000; // OTP valid for 15 minutes

        // Store OTP in user document
        user.resetPasswordOTP = otp;
        user.resetPasswordExpires = otpExpiry;
        await user.save();

        // Send email with OTP
        const mailContent = `
            You requested a password reset for your Needle account.

            Your OTP code is: ${otp}

            This code will expire in 15 minutes. If you didn't request this, please ignore this email.

            Best regards,
            The Needle Team
        `;

        await sendEmail(email, 'Password Reset OTP - Needle', mailContent);

        res.status(200).json({
            success: true,
            message: 'OTP sent to your email',
            email: email,
            userType: userType
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: 'Failed to process request',
            error: err.message
        });
    }
});

// Verify OTP for password reset
app.post('/verify-reset-otp', async (req, res) => {
    const { email, otp, userType } = req.body;

    if (!email || !otp || !userType) {
        return res.status(400).json({
            success: false,
            message: 'Email, OTP and user type are required'
        });
    }

    try {
        let user;
        if (userType === 'user') {
            user = await User.findOne({ email: email.toLowerCase() });
        } else if (userType === 'employer') {
            user = await EmployerCredentials.findOne({ email: email.toLowerCase() });
        } else if (userType === 'employee') {
            user = await Employee.findOne({ email: email.toLowerCase() });
        } else {
            return res.status(400).json({
                success: false,
                message: 'Invalid user type'
            });
        }

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Email not found'
            });
        }

        // Check if OTP matches and is not expired
        if (user.resetPasswordOTP !== otp || user.resetPasswordExpires < Date.now()) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired OTP'
            });
        }

        // OTP is valid - generate a reset token
        const resetToken = crypto.randomBytes(20).toString('hex');
        user.resetPasswordToken = resetToken;
        user.resetPasswordExpires = Date.now() + 15 * 60 * 1000; // Token valid for 15 minutes
        await user.save();

        res.status(200).json({
            success: true,
            message: 'OTP verified successfully',
            resetToken: resetToken,
            email: email,
            userType: userType
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: 'Failed to verify OTP',
            error: err.message
        });
    }
});

// Reset password after OTP verification
app.post('/reset-password', async (req, res) => {
    const { email, resetToken, newPassword, userType } = req.body;

    if (!email || !resetToken || !newPassword || !userType) {
        return res.status(400).json({
            success: false,
            message: 'All fields are required'
        });
    }

    try {
        let user;
        if (userType === 'user') {
            user = await User.findOne({ email: email.toLowerCase() });
        } else if (userType === 'employer') {
            user = await EmployerCredentials.findOne({ email: email.toLowerCase() });
        } else if (userType === 'employee') {
            user = await Employee.findOne({ email: email.toLowerCase() });
        } else {
            return res.status(400).json({
                success: false,
                message: 'Invalid user type'
            });
        }

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Email not found'
            });
        }

        // Verify reset token
        if (user.resetPasswordToken !== resetToken || user.resetPasswordExpires < Date.now()) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired token'
            });
        }

        // Update password and clear reset fields
        user.password = newPassword;
        user.resetPasswordOTP = undefined;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();

        // Send confirmation email
        await sendEmail(email, 'Password Reset Successful - Needle',
            'Your Needle account password has been successfully reset.');

        res.status(200).json({
            success: true,
            message: 'Password reset successfully'
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: 'Failed to reset password',
            error: err.message
        });
    }
});

// Job Application Submission
app.post('/upload-job', upload.fields([
    { name: 'resume', maxCount: 1 },
    { name: 'coverletter', maxCount: 1 }
]), async (req, res) => {
    try {
        const { name, email, referral, position, field, company, description } = req.body;
        const resumeFile = req.files['resume'] ? req.files['resume'][0] : null;
        const coverLetterFile = req.files['coverletter'] ? req.files['coverletter'][0] : null;

        if (!name || !email || !resumeFile || !position || !company) {
            return res.status(400).json({
                success: false,
                message: 'Name, email, resume, position, and company are required'
            });
        }

        // Upload files to GridFS
        const { id: resumeId, name: resumeName } = await uploadFileToGridFS(resumeFile);
        const coverLetterInfo = coverLetterFile ? await uploadFileToGridFS(coverLetterFile) : { id: null, name: null };

        // Find or create job posting
        let jobPosting = await JobPosting.findOne({
            title: position,
            company: company
        });

        if (!jobPosting) {
            jobPosting = new JobPosting({
                title: position,
                description: description || '',
                department: field || '',
                company: company,
                applicants: []
            });
            await jobPosting.save();
        }

        // Create application record
        const application = new JobApplication({
            jobId: jobPosting._id,
            name,
            email,
            resumeId,
            resumeType: resumeFile.mimetype,
            resumeName,
            coverLetterId: coverLetterInfo.id,
            coverLetterType: coverLetterFile ? coverLetterFile.mimetype : null,
            coverLetterName: coverLetterInfo.name,
            referral,
            status: 'Submitted'
        });

        await application.save();

        // Add application to job posting
        jobPosting.applicants.push(application._id);
        await jobPosting.save();

        // Send confirmation email
        await sendEmail(email, 'Application Submitted Successfully',
            `Dear ${name},\n\nThank you for applying to the ${position} position at ${company}.\n\nWe will review your application and get back to you soon.\n\nBest regards,\nTeam Needle`);

        res.status(200).json({
            success: true,
            message: 'Application submitted successfully',
            applicationId: application._id
        });

    } catch (err) {
        console.error('Application submission error:', err);
        res.status(500).json({
            success: false,
            message: 'Failed to submit application',
            error: err.message
        });
    }
});

// Get application status
app.get('/api/applications', async (req, res) => {
    try {
        const applications = await JobApplication.find()
            .populate('jobId', 'title company description department')
            .sort({ appliedAt: -1 });

        // Log the applications data to inspect its structure
        console.log('Fetched applications:', applications);

        const applicationsWithFiles = await Promise.all(applications.map(async app => {
            const resumeFile = await gfs.find({ _id: app.resumeId }).toArray();
            const coverLetterFile = app.coverLetterId ? await gfs.find({ _id: app.coverLetterId }).toArray() : null;

            // Check if jobId is populated
            const jobDetails = app.jobId ? {
                position: app.jobId.title || 'N/A',
                field: app.jobId.department || 'N/A',
                company: app.jobId.company || 'N/A',
                description: app.jobId.description || 'N/A'
            } : {
                position: 'N/A',
                field: 'N/A',
                company: 'N/A',
                description: 'N/A'
            };

            return {
                _id: app._id,
                name: app.name,
                email: app.email,
                referral: app.referral,
                status: app.status,
                appliedAt: app.appliedAt,
                resume: {
                    id: app.resumeId,
                    name: resumeFile.length > 0 ? resumeFile[0].filename : 'Unknown',
                    size: resumeFile.length > 0 ? (resumeFile[0].length / 1024).toFixed(2) + ' KB' : 'N/A'
                },
                coverLetter: app.coverLetterId ? {
                    id: app.coverLetterId,
                    name: coverLetterFile.length > 0 ? coverLetterFile[0].filename : 'Unknown',
                    size: coverLetterFile.length > 0 ? (coverLetterFile[0].length / 1024).toFixed(2) + ' KB' : 'N/A'
                } : null,
                jobDetails: jobDetails
            };
        }));

        res.status(200).json({
            success: true,
            applications: applicationsWithFiles
        });
    } catch (err) {
        console.error('Error fetching applications:', err);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch applications',
            error: err.message
        });
    }
});


// Enhanced Referral Submission Route
app.post('/submit-referral', async (req, res) => {
    console.log('Received referral submission:', req.body);

    const { referrerName, referrerEmail, candidateName, candidateEmail, position, otherPosition, message } = req.body;

    // Validate position selection
    const selectedPosition = position === 'Other' ? otherPosition : position;
    if (!selectedPosition || (position === 'Other' && !otherPosition)) {
        return res.status(400).json({ 
            success: false,
            message: 'Please select or specify a position'
        });
    }

    // Validate required fields
    const requiredFields = { referrerName, referrerEmail, candidateName, candidateEmail };
    const missingFields = Object.entries(requiredFields)
        .filter(([_, value]) => !value)
        .map(([key]) => key);

    if (missingFields.length > 0) {
        return res.status(400).json({ 
            success: false,
            message: `Missing required fields: ${missingFields.join(', ')}`
        });
    }

    // Validate email formats
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(referrerEmail)) {
        return res.status(400).json({ 
            success: false,
            message: 'Referrer email is invalid'
        });
    }
    if (!emailRegex.test(candidateEmail)) {
        return res.status(400).json({ 
            success: false,
            message: 'Candidate email is invalid'
        });
    }

    try {
        // Prepare email content
        const emailContent = {
            candidate: {
                subject: 'You Have Been Referred for a Job Position',
                text: `Dear ${candidateName},\n\nYou have been referred by ${referrerName} (${referrerEmail}) ` +
                      `for the position of ${selectedPosition} at Needle.\n\n` +
                      `${message ? `Message from referrer: ${message}\n\n` : ''}` +
                      `If you are interested in this opportunity, please send your updated resume to ` +
                      `Needle.info1@gmail.com at your earliest convenience.\n\n` +
                      `Best regards,\nThe Needle Team`,
                html: `<div style="font-family: Arial, sans-serif; line-height: 1.6;">
                        <p>Dear ${candidateName},</p>
                        <p>You have been referred by ${referrerName} (${referrerEmail}) 
                        for the position of ${selectedPosition} at Needle.</p>
                        ${message ? `<p>Message from referrer: ${message}</p>` : ''}
                        <p>If you are interested in this opportunity, please send your updated resume to 
                        Needle.info1@gmail.com at your earliest convenience.</p>
                        <p>Best regards,<br>The Needle Team</p>
                       </div>`
            },
            referrer: {
                subject: 'Referral Submission Confirmation',
                text: `Dear ${referrerName},\n\nThank you for referring ${candidateName} ` +
                      `(${candidateEmail}) for the position of ${selectedPosition}.\n\n` +
                      `We'll review the candidate and get back to you if we need any additional information.\n\n` +
                      `Best regards,\nThe Needle Team`,
                html: `<div style="font-family: Arial, sans-serif; line-height: 1.6;">
                        <p>Dear ${referrerName},</p>
                        <p>Thank you for referring ${candidateName} (${candidateEmail}) 
                        for the position of ${selectedPosition}.</p>
                        <p>We'll review the candidate and get back to you if we need any additional information.</p>
                        <p>Best regards,<br>The Needle Team</p>
                       </div>`
            }
        };

        // Send emails with retry logic
        const sendWithRetry = async (to, subject, text, html, retries = 3) => {
            for (let i = 0; i < retries; i++) {
                try {
                    const info = await transporter.sendMail({
                        from: 'Needle <Needle.info1@gmail.com>',
                        to,
                        subject,
                        text,
                        html
                    });
                    return info;
                } catch (err) {
                    if (i === retries - 1) throw err;
                    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retry
                }
            }
        };

        // Send emails
        console.log(`Sending email to candidate: ${candidateEmail}`);
        await sendWithRetry(
            candidateEmail,
            emailContent.candidate.subject,
            emailContent.candidate.text,
            emailContent.candidate.html
        );
        
        console.log(`Sending email to referrer: ${referrerEmail}`);
        await sendWithRetry(
            referrerEmail,
            emailContent.referrer.subject,
            emailContent.referrer.text,
            emailContent.referrer.html
        );

        console.log('Referral submitted successfully');
        return res.status(200).json({ 
            success: true,
            message: 'Referral submitted successfully!',
            data: {
                referrer: referrerName,
                candidate: candidateName,
                position: selectedPosition
            }
        });

    } catch (err) {
        console.error('Referral submission error:', err);
        let errorMessage = 'Failed to submit referral';
        
        if (err.code === 'EAUTH') {
            errorMessage = 'Email authentication failed. Please check server email configuration.';
        } else if (err.code === 'EENVELOPE') {
            errorMessage = 'Invalid email address provided.';
        }
        
        return res.status(500).json({ 
            success: false,
            message: errorMessage,
            error: err.message,
            details: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    }
});


// Get all applications for admin view
app.get('/api/applications', async (req, res) => {
    try {
        const applications = await JobApplication.find()
            .populate('jobId', 'title company description department')
            .sort({ appliedAt: -1 });

        // Get file details from GridFS
        const applicationsWithFiles = await Promise.all(applications.map(async app => {
            const resumeFile = await gfs.find({ _id: app.resumeId }).toArray();
            const coverLetterFile = app.coverLetterId ? await gfs.find({ _id: app.coverLetterId }).toArray() : null;

            return {
                _id: app._id,
                name: app.name,
                email: app.email,
                referral: app.referral,
                status: app.status,
                appliedAt: app.appliedAt,
                resume: {
                    id: app.resumeId,
                    name: resumeFile.length > 0 ? resumeFile[0].filename : 'Unknown',
                    size: resumeFile.length > 0 ? (resumeFile[0].length / 1024).toFixed(2) + ' KB' : 'N/A'
                },
                coverLetter: app.coverLetterId ? {
                    id: app.coverLetterId,
                    name: coverLetterFile.length > 0 ? coverLetterFile[0].filename : 'Unknown',
                    size: coverLetterFile.length > 0 ? (coverLetterFile[0].length / 1024).toFixed(2) + ' KB' : 'N/A'
                } : null,
                jobDetails: {
                    position: app.jobId.title,
                    field: app.jobId.department,
                    company: app.jobId.company,
                    description: app.jobId.description
                }
            };
        }));

        res.status(200).json({
            success: true,
            applications: applicationsWithFiles
        });
    } catch (err) {
        console.error('Error fetching applications:', err);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch applications',
            error: err.message
        });
    }
});
// Serve HTML Files
app.get('/:filename', (req, res) => {
    const filePath = path.join(__dirname, 'public', req.params.filename);
    res.sendFile(filePath, err => {
        if (err) {
            res.status(404).send('File not found');
        }
    });
});

// Start Server
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
