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
const PORT = process.env.PORT || 3000;


// MongoDB Connection
const mongoURI = "mongodb+srv://arshdeepkhurana3:Arshdeep00%40@needle.j6dcl.mongodb.net/Needle?retryWrites=true&w=majority";
 
// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
 
// Initialize GridFS storage
let gfs;
const conn = mongoose.connection;
conn.once('open', () => {
    gfs = new GridFSBucket(conn.db, { bucketName: 'uploads' });
    console.log('GridFS initialized');
});
 
// Multer configuration for file uploads
const storage = new GridFsStorage({
    url: mongoURI,
    file: (req, file) => {
        return new Promise((resolve, reject) => {
            crypto.randomBytes(16, (err, buf) => {
                if (err) {
                    return reject(err);
                }
                const filename = buf.toString('hex') + path.extname(file.originalname);
                const fileInfo = {
                    filename: filename,
                    bucketName: 'uploads',
                    metadata: {
                        originalName: file.originalname,
                        uploadDate: new Date(),
                        applicantEmail: req.body.email,
                        fileType: file.fieldname
                    }
                };
                resolve(fileInfo);
            });
        });
    }
});
 
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only PDF, DOC, and DOCX files are allowed.'));
        }
    }
});
 
// Connect to MongoDB
mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('Connected to MongoDB Atlas'))
    .catch(err => console.error('Failed to connect to MongoDB:', err));



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

// Updated Employee Schema
const employeeSchema = new mongoose.Schema({
    firstName: String,
    lastName: String,
    phoneNumber: String,
    companyName: String,
    companyEmail: String,
    joiningDate: Date,
    department: String,
    position: String,
    email: { type: String, unique: true },
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

// Updated Employee Login Endpoint
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

        // Prepare employee data for response
        const employeeData = {
            _id: employee._id,
            firstName: employee.firstName,
            lastName: employee.lastName,
            fullName: `${employee.firstName} ${employee.lastName}`,
            phoneNumber: employee.phoneNumber,
            companyName: employee.companyName,
            companyEmail: employee.companyEmail,
            joiningDate: employee.joiningDate,
            department: employee.department,
            position: employee.position,
            email: employee.email,
            emoji: employee.emoji,
            status: employee.status
        };

        res.status(200).json({
            success: true,
            message: 'Login successful',
            token: 'dummy-token-for-now', // Replace with real token in production
            employee: employeeData
        });

    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ 
            success: false,
            message: 'Login failed', 
            error: err.message 
        });
    }
});

// Enhanced Get Employee Endpoint
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

        const employeeData = {
            _id: employee._id,
            firstName: employee.firstName,
            lastName: employee.lastName,
            fullName: `${employee.firstName} ${employee.lastName}`,
            phoneNumber: employee.phoneNumber,
            companyName: employee.companyName,
            companyEmail: employee.companyEmail,
            joiningDate: employee.joiningDate,
            department: employee.department,
            position: employee.position,
            email: employee.email,
            emoji: employee.emoji,
            status: employee.status
        };

        res.status(200).json({
            success: true,
            employee: employeeData
        });
    } catch (err) {
        console.error('Error fetching employee:', err);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch employee',
            error: err.message
        });
    }
});

// Update Employee Emoji Endpoint
app.put('/api/employees/:id/emoji', async (req, res) => {
    try {
        const { emoji } = req.body;

        if (!emoji) {
            return res.status(400).json({
                success: false,
                message: 'Emoji is required'
            });
        }

        const employee = await Employee.findByIdAndUpdate(
            req.params.id,
            { emoji },
            { new: true }
        ).select('-password');

        if (!employee) {
            return res.status(404).json({
                success: false,
                message: 'Employee not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Emoji updated successfully',
            emoji: employee.emoji
        });
    } catch (err) {
        console.error('Error updating emoji:', err);
        res.status(500).json({
            success: false,
            message: 'Failed to update emoji',
            error: err.message
        });
    }
});

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

// Employee Registration Endpoint
// Updated Employee Registration Endpoint
app.post('/register-employee', async (req, res) => {
    const {
        firstName,
        lastName,
        phoneNumber,
        companyName,
        companyEmail,
        joiningDate,
        department,
        position,
        email,
        password,
        emoji
    } = req.body;

    try {
        // Check if employee already exists
        const existingEmployee = await Employee.findOne({ 
            $or: [
                { email: email.toLowerCase() },
                { companyEmail: companyEmail.toLowerCase() }
            ]
        });
        
        if (existingEmployee) {
            return res.status(400).json({
                success: false,
                message: 'Employee with this email already exists'
            });
        }

        // Create new employee
        const newEmployee = new Employee({
            firstName,
            lastName,
            fullName: `${firstName} ${lastName}`,
            phoneNumber,
            companyName,
            companyEmail,
            joiningDate: new Date(joiningDate),
            department,
            position,
            email: email.toLowerCase(),
            password, // Note: In production, hash this password
            emoji: emoji || '👤',
            status: 'active'
        });

        await newEmployee.save();

        // Return the complete employee data including _id
        const employeeResponse = {
            _id: newEmployee._id,
            firstName: newEmployee.firstName,
            lastName: newEmployee.lastName,
            fullName: newEmployee.fullName,
            phoneNumber: newEmployee.phoneNumber,
            companyName: newEmployee.companyName,
            companyEmail: newEmployee.companyEmail,
            joiningDate: newEmployee.joiningDate,
            department: newEmployee.department,
            position: newEmployee.position,
            email: newEmployee.email,
            emoji: newEmployee.emoji,
            status: newEmployee.status
        };

        res.status(201).json({
            success: true,
            message: 'Employee registered successfully',
            employee: employeeResponse,
            redirectUrl: '/employeelogin.html'
        });

    } catch (err) {
        console.error('Registration error:', err);
        res.status(500).json({
            success: false,
            message: 'Failed to register employee',
            error: err.message
        });
    }
});

// Employee Login - Updated and Fixed
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

        // Safely handle profile picture data
        let profilePicture = null;
        if (employee.profilePicture && employee.profilePicture.data) {
            profilePicture = {
                data: employee.profilePicture.data.toString('base64'),
                contentType: employee.profilePicture.contentType
            };
        }

        res.status(200).json({
            success: true,
            message: 'Login successful',
            token: crypto.randomBytes(32).toString('hex'),
            employee: {
                id: employee._id,
                email: employee.email,
                companyName: employee.companyName,
                companyEmail: employee.companyEmail,
                joiningDate: employee.joiningDate,
                department: employee.department,
                position: employee.position,
                profilePicture: profilePicture
            }
        });

    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ 
            success: false,
            message: 'Login failed', 
            error: err.message 
        });
    }
});

// Get Employee Profile
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

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
