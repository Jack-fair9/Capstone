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
    companyName: String,
    companyEmail: String,
    joiningDate: Date,
    department: String,
    position: String,
    email: { type: String, unique: true },
    password: String,
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
    applicants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Employee' }]
});
const JobPosting = mongoose.model('JobPosting', jobPostingSchema);

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

// Employee Registration Endpoint - Updated for better connection with login
app.post('/register-employee', upload.single('profilePicture'), async (req, res) => {
    const { companyName, companyEmail, joiningDate, department, position, email, password } = req.body;

    if (!companyName || !companyEmail || !joiningDate || !department || !position || !email || !password) {
        return res.status(400).json({ 
            success: false,
            message: 'All fields are required!' 
        });
    }

    try {
        if (await Employee.findOne({ email: email.toLowerCase() })) {
            return res.status(400).json({ 
                success: false,
                message: 'Email is already registered.' 
            });
        }

        const newEmployee = new Employee({
            companyName,
            companyEmail,
            joiningDate,
            department,
            position,
            email: email.toLowerCase(),
            password,
            profilePicture: req.file ? {
                data: req.file.buffer,
                contentType: req.file.mimetype
            } : null
        });

        await newEmployee.save();

        // Send confirmation email
        const mailContent = `
            Your employee account has been successfully created with Needle.

            Company Name: ${companyName}
            Company Email: ${companyEmail}
            Position: ${position}
            Department: ${department}

            You can now log in using your personal email and password.

            Best regards,
            The Needle Team
        `;

        await sendEmail(email, 'Employee Account Created - Needle', mailContent);

        res.status(201).json({
            success: true,
            message: 'Employee registered successfully!',
            redirectUrl: '/employee-login.html',
            email: email // Pass email to pre-fill login form
        });
    } catch (err) {
        res.status(500).json({ 
            success: false,
            message: 'Failed to register employee.', 
            error: err.message 
        });
    }
});

// Updated Employee Login Endpoint
app.post('/api/employees/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ 
            success: false,
            message: 'Email and password are required!' 
        });
    }

    try {
        const employee = await Employee.findOne({ email: email.toLowerCase() });

        if (!employee) {
            return res.status(401).json({ 
                success: false,
                message: 'Invalid email or password.' 
            });
        }

        if (employee.password !== password) {
            return res.status(401).json({ 
                success: false,
                message: 'Invalid email or password.' 
            });
        }

        // Create a simple token (in production, use JWT)
        const token = crypto.randomBytes(16).toString('hex');

        res.status(200).json({
            success: true,
            message: 'Login successful!',
            token: token,
            employee: {
                email: employee.email,
                companyName: employee.companyName,
                position: employee.position,
                department: employee.department
            }
        });
    } catch (err) {
        res.status(500).json({ 
            success: false,
            message: 'Something went wrong.', 
            error: err.message 
        });
    }
});

// Employee Profile Endpoint
app.get('/employee-profile', async (req, res) => {
    const { email } = req.query;

    if (!email) {
        return res.status(400).json({
            success: false,
            message: 'Email is required'
        });
    }

    try {
        const employee = await Employee.findOne({ email: email.toLowerCase() });

        if (!employee) {
            return res.status(404).json({
                success: false,
                message: 'Employee not found'
            });
        }

        // Prepare the response data
        const employeeData = {
            email: employee.email,
            companyName: employee.companyName,
            companyEmail: employee.companyEmail,
            joiningDate: employee.joiningDate,
            department: employee.department,
            position: employee.position,
            profilePicture: employee.profilePicture ? {
                data: employee.profilePicture.data.toString('base64'),
                contentType: employee.profilePicture.contentType
            } : null
        };

        res.status(200).json({
            success: true,
            employee: employeeData
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});

// Get all job postings
app.get('/job-postings', async (req, res) => {
    try {
        const postings = await JobPosting.find().select('-applicants');
        res.status(200).json({
            success: true,
            postings
        });
    } catch (err) {
        res.status(500).json({ 
            success: false,
            message: 'Failed to fetch job postings', 
            error: err.message 
        });
    }
});

// Apply for a job
app.post('/apply-job', async (req, res) => {
    const { jobId, employeeEmail } = req.body;

    if (!jobId || !employeeEmail) {
        return res.status(400).json({ 
            success: false,
            message: 'Job ID and employee email are required' 
        });
    }

    try {
        // Find the employee
        const employee = await Employee.findOne({ email: employeeEmail.toLowerCase() });
        if (!employee) {
            return res.status(404).json({ 
                success: false,
                message: 'Employee not found' 
            });
        }

        // Find the job posting
        const job = await JobPosting.findById(jobId);
        if (!job) {
            return res.status(404).json({ 
                success: false,
                message: 'Job posting not found' 
            });
        }

        // Check if already applied
        if (job.applicants.some(appliedId => appliedId.equals(employee._id))) {
            return res.status(400).json({ 
                success: false,
                message: 'You have already applied for this job' 
            });
        }

        // Add applicant
        job.applicants.push(employee._id);
        await job.save();

        res.status(200).json({ 
            success: true,
            message: 'Application submitted successfully!' 
        });
    } catch (err) {
        res.status(500).json({ 
            success: false,
            message: 'Failed to apply for job', 
            error: err.message 
        });
    }
});

// Get employee's applied jobs
app.get('/applied-jobs', async (req, res) => {
    const { email } = req.query;

    if (!email) {
        return res.status(400).json({ 
            success: false,
            message: 'Employee email is required' 
        });
    }

    try {
        const employee = await Employee.findOne({ email: email.toLowerCase() });
        if (!employee) {
            return res.status(404).json({ 
                success: false,
                message: 'Employee not found' 
            });
        }

        const appliedJobs = await JobPosting.find({ applicants: employee._id })
            .select('title description department company createdAt');

        res.status(200).json({ 
            success: true,
            appliedJobs 
        });
    } catch (err) {
        res.status(500).json({ 
            success: false,
            message: 'Failed to fetch applied jobs', 
            error: err.message 
        });
    }
});

// Create a new job posting (for employers)
app.post('/create-job', async (req, res) => {
    const { title, description, department, company, employerEmail } = req.body;

    if (!title || !description || !department || !company || !employerEmail) {
        return res.status(400).json({ 
            success: false,
            message: 'All fields are required' 
        });
    }

    try {
        const employer = await EmployerCredentials.findOne({ email: employerEmail.toLowerCase() });
        if (!employer) {
            return res.status(404).json({ 
                success: false,
                message: 'Employer not found' 
            });
        }

        const newJob = new JobPosting({
            title,
            description,
            department,
            company,
            postedBy: employer._id
        });

        await newJob.save();

        res.status(201).json({
            success: true,
            message: 'Job posting created successfully',
            job: newJob
        });
    } catch (err) {
        res.status(500).json({ 
            success: false,
            message: 'Failed to create job posting', 
            error: err.message 
        });
    }
});

// Generate and send OTP for password reset
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

        // OTP is valid - generate a reset token (for the frontend to use)
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
// In your server.js
app.get('/api/employees/:id', async (req, res) => {
    try {
        const employee = await Employee.findById(req.params.id)
            .select('-password -resetPasswordToken -resetPasswordExpires');
        
        if (!employee) {
            return res.status(404).json({
                success: false,
                message: 'Employee not found'
            });
        }

        // Format the employee data including profile picture
        const employeeData = {
            id: employee._id,
            companyName: employee.companyName,
            companyEmail: employee.companyEmail,
            joiningDate: employee.joiningDate,
            department: employee.department,
            position: employee.position,
            email: employee.email,
            profilePicture: employee.profilePicture ? {
                data: employee.profilePicture.data.toString('base64'),
                contentType: employee.profilePicture.contentType
            } : null
        };

        res.status(200).json({
            success: true,
            employee: employeeData
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch employee',
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
