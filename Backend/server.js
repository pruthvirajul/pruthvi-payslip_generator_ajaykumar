
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

const app = express();
const port = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use('/static', express.static(path.join(__dirname, 'public')));

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'new_employee_db',
    password: 'Password@12345',
    port: 5432
});

// Error logging
const logError = (message, error) => {
    console.error(`[${new Date().toISOString()}] ${message}:`, error.message || error);
};

// Initialize database
async function initializeDatabase() {
    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS payslips (
            payslip_id VARCHAR(20) PRIMARY KEY,
            employee_id TEXT NOT NULL,
            employee_name TEXT NOT NULL,
            employee_email TEXT NOT NULL,
            month_year TEXT NOT NULL,
            basic_salary DECIMAL(10,2) NOT NULL,
            da DECIMAL(10,2) NOT NULL,
            hra DECIMAL(10,2) NOT NULL,
            wage_allowance DECIMAL(10,2) NOT NULL,
            medical_allowance DECIMAL(10,2) NOT NULL,
            pf DECIMAL(10,2) NOT NULL,
            esi DECIMAL(10,2) NOT NULL,
            tds DECIMAL(10,2) NOT NULL,
            lwp DECIMAL(10,2) NOT NULL,
            special_deduction DECIMAL(10,2) NOT NULL,
            net_salary DECIMAL(10,2) NOT NULL,
            status TEXT NOT NULL,
            CONSTRAINT unique_employee_month_year UNIQUE (employee_id, month_year)
        );
    `;

    try {
        await pool.query(createTableQuery);
        console.log(`[${new Date().toISOString()}] Database initialized successfully`);
    } catch (err) {
        logError('Error initializing database', err);
        throw err;
    }
}

// Connect to database
pool.connect()
    .then(() => {
        console.log(`[${new Date().toISOString()}] Connected to PostgreSQL`);
        return initializeDatabase();
    })
    .catch(err => {
        logError('Database connection error', err);
        process.exit(1);
    });

// Validation middleware for payslip creation
const validatePayslipData = (req, res, next) => {
    const requiredFields = [
        'employee_id', 'employee_name', 'employee_email', 'month_year',
        'basic_salary', 'da', 'hra', 'wage_allowance', 'medical_allowance',
        'pf', 'esi', 'tds', 'lwp', 'special_deduction'
    ];

    for (const field of requiredFields) {
        if (req.body[field] === undefined || req.body[field] === null) {
            logError('Validation error', new Error(`${field} is required`));
            return res.status(400).json({ error: `${field} is required` });
        }
    }

    if (!/^ATS0[0-9]{3}$/.test(req.body.employee_id) || req.body.employee_id === 'ATS0000') {
        logError('Validation error', new Error('Invalid employee_id'));
        return res.status(400).json({ error: 'Employee ID must be ATS0 followed by 3 digits (not 000)' });
    }

    if (!/^[a-zA-Z]+(?:\s[a-zA-Z]+)*$/.test(req.body.employee_name)) {
        logError('Validation error', new Error('Invalid employee_name'));
        return res.status(400).json({ error: 'Name must contain letters and single spaces' });
    }

    if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.(com|in|org|co\.in)$/i.test(req.body.employee_email)) {
        logError('Validation error', new Error('Invalid employee_email'));
        return res.status(400).json({ error: 'Invalid email format' });
    }

    if (!/^[A-Za-z]+\s[0-9]{4}$/.test(req.body.month_year)) {
        logError('Validation error', new Error('Invalid month_year'));
        return res.status(400).json({ error: 'Month/Year must be in "Month YYYY" format' });
    }

    if (typeof req.body.basic_salary !== 'number' || req.body.basic_salary <= 0) {
        logError('Validation error', new Error('Invalid basic_salary'));
        return res.status(400).json({ error: 'Basic salary must be a positive number' });
    }

    const numericFields = ['da', 'hra', 'wage_allowance', 'medical_allowance', 'pf', 'esi', 'tds', 'lwp', 'special_deduction'];
    for (const field of numericFields) {
        if (typeof req.body[field] !== 'number' || req.body[field] < 0) {
            logError('Validation error', new Error(`Invalid ${field}`));
            return res.status(400).json({ error: `${field} must be a non-negative number` });
        }
    }

    next();
};

// Generate payslip
app.post('/api/payslips', validatePayslipData, async (req, res) => {
    const {
        employee_id, employee_name, employee_email, month_year,
        basic_salary, da, hra, wage_allowance, medical_allowance,
        pf, esi, tds, lwp, special_deduction
    } = req.body;

    const net_salary = (basic_salary + da + hra + wage_allowance + medical_allowance) -
        (pf + esi + tds + lwp + special_deduction);

    const yearMonth = month_year.replace(' ', '').toUpperCase();
    const payslip_id = `PSL-${yearMonth}-${Math.floor(100 + Math.random() * 900)}`;

    try {
        // Check for duplicate
        const checkResult = await pool.query(
            'SELECT 1 FROM payslips WHERE employee_id = $1 AND month_year = $2',
            [employee_id, month_year]
        );

        if (checkResult.rowCount > 0) {
            logError('Payslip creation error', new Error('Duplicate payslip'));
            return res.status(400).json({ error: 'Payslip already exists for this employee and month/year' });
        }

        // Insert new payslip
        const insertResult = await pool.query(
            `INSERT INTO payslips (
                payslip_id, employee_id, employee_name, employee_email, month_year,
                basic_salary, da, hra, wage_allowance, medical_allowance,
                pf, esi, tds, lwp, special_deduction, net_salary, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
            RETURNING *`,
            [
                payslip_id, employee_id, employee_name, employee_email, month_year,
                basic_salary, da, hra, wage_allowance, medical_allowance,
                pf, esi, tds, lwp, special_deduction, net_salary, 'Generated'
            ]
        );

        const payslip = {
            payslip_id: insertResult.rows[0].payslip_id,
            employee_id: insertResult.rows[0].employee_id,
            employee_name: insertResult.rows[0].employee_name,
            employee_email: insertResult.rows[0].employee_email,
            month_year: insertResult.rows[0].month_year,
            basic_salary: parseFloat(insertResult.rows[0].basic_salary),
            da: parseFloat(insertResult.rows[0].da),
            hra: parseFloat(insertResult.rows[0].hra),
            wage_allowance: parseFloat(insertResult.rows[0].wage_allowance),
            medical_allowance: parseFloat(insertResult.rows[0].medical_allowance),
            pf: parseFloat(insertResult.rows[0].pf),
            esi: parseFloat(insertResult.rows[0].esi),
            tds: parseFloat(insertResult.rows[0].tds),
            lwp: parseFloat(insertResult.rows[0].lwp),
            special_deduction: parseFloat(insertResult.rows[0].special_deduction),
            net_salary: parseFloat(insertResult.rows[0].net_salary),
            status: insertResult.rows[0].status
        };

        console.log(`[${new Date().toISOString()}] Payslip created: ${payslip_id}`);
        res.status(201).json(payslip);
    } catch (err) {
        logError('Error generating payslip', err);
        res.status(500).json({ error: `Failed to generate payslip: ${err.message}` });
    }
});

// Get payslip history
app.get('/api/payslips/history', async (req, res) => {
    const { search, month, year } = req.query;

    try {
        let query = 'SELECT * FROM payslips WHERE 1=1';
        const params = [];

        if (search) {
            query += ` AND (employee_id ILIKE $${params.length + 1} OR employee_name ILIKE $${params.length + 1})`;
            params.push(`%${search}%`);
        }

        if (month) {
            query += ` AND EXTRACT(MONTH FROM TO_DATE(month_year, 'Month YYYY')) = $${params.length + 1}`;
            params.push(parseInt(month));
        }

        if (year) {
            query += ` AND EXTRACT(YEAR FROM TO_DATE(month_year, 'Month YYYY')) = $${params.length + 1}`;
            params.push(parseInt(year));
        }

        query += ` ORDER BY TO_DATE(month_year, 'Month YYYY') DESC`;

        const result = await pool.query(query, params);
        const payslips = result.rows.map(row => ({
            payslip_id: row.payslip_id,
            employee_id: row.employee_id,
            employee_name: row.employee_name,
            employee_email: row.employee_email,
            month_year: row.month_year,
            basic_salary: parseFloat(row.basic_salary),
            da: parseFloat(row.da),
            hra: parseFloat(row.hra),
            wage_allowance: parseFloat(row.wage_allowance),
            medical_allowance: parseFloat(row.medical_allowance),
            pf: parseFloat(row.pf),
            esi: parseFloat(row.esi),
            tds: parseFloat(row.tds),
            lwp: parseFloat(row.lwp),
            special_deduction: parseFloat(row.special_deduction),
            net_salary: parseFloat(row.net_salary),
            status: row.status
        }));

        console.log(`[${new Date().toISOString()}] Fetched ${payslips.length} payslips`);
        res.json(payslips);
    } catch (err) {
        logError('Error fetching payslip history', err);
        res.status(500).json({ error: `Failed to fetch payslip history: ${err.message}` });
    }
});

// Get payslips by employee and date range
app.get('/api/payslips', async (req, res) => {
    const { employee_id, employee_email, start_month, end_month } = req.query;

    if (!employee_id || !employee_email) {
        logError('Validation error', new Error('Missing required parameters'));
        return res.status(400).json({ error: 'Employee ID and email are required' });
    }

    if (!/^ATS0[0-9]{3}$/.test(employee_id) || employee_id === 'ATS0000') {
        logError('Validation error', new Error('Invalid employee_id'));
        return res.status(400).json({ error: 'Employee ID must be ATS0 followed by 3 digits (not 000)' });
    }

    if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.(com|in|org|co\.in)$/i.test(employee_email)) {
        logError('Validation error', new Error('Invalid employee_email'));
        return res.status(400).json({ error: 'Invalid email format' });
    }

    try {
        // Verify employee_id and employee_email match
        const authResult = await pool.query(
            'SELECT 1 FROM payslips WHERE employee_id = $1 AND employee_email = $2 LIMIT 1',
            [employee_id, employee_email]
        );

        if (authResult.rowCount === 0) {
            logError('Authorization error', new Error('Invalid employee ID or email'));
            return res.status(403).json({ error: 'Invalid employee ID or email' });
        }

        let query = 'SELECT * FROM payslips WHERE employee_id = $1';
        const params = [employee_id];

        if (start_month) {
            if (!/^[A-Za-z]+\s[0-9]{4}$/.test(start_month)) {
                logError('Validation error', new Error('Invalid start_month'));
                return res.status(400).json({ error: 'Start month must be in "Month YYYY" format' });
            }
            query += ` AND TO_DATE(month_year, 'Month YYYY') >= TO_DATE($${params.length + 1}, 'Month YYYY')`;
            params.push(start_month);
        }

        if (end_month) {
            if (!/^[A-Za-z]+\s[0-9]{4}$/.test(end_month)) {
                logError('Validation error', new Error('Invalid end_month'));
                return res.status(400).json({ error: 'End month must be in "Month YYYY" format' });
            }
            query += ` AND TO_DATE(month_year, 'Month YYYY') <= TO_DATE($${params.length + 1}, 'Month YYYY')`;
            params.push(end_month);
        }

        query += ` ORDER BY TO_DATE(month_year, 'Month YYYY') DESC`;

        const result = await pool.query(query, params);
        const payslips = result.rows.map(row => ({
            payslip_id: row.payslip_id,
            employee_id: row.employee_id,
            employee_name: row.employee_name,
            employee_email: row.employee_email,
            month_year: row.month_year,
            basic_salary: parseFloat(row.basic_salary),
            da: parseFloat(row.da),
            hra: parseFloat(row.hra),
            wage_allowance: parseFloat(row.wage_allowance),
            medical_allowance: parseFloat(row.medical_allowance),
            pf: parseFloat(row.pf),
            esi: parseFloat(row.esi),
            tds: parseFloat(row.tds),
            lwp: parseFloat(row.lwp),
            special_deduction: parseFloat(row.special_deduction),
            net_salary: parseFloat(row.net_salary),
            status: row.status
        }));

        console.log(`[${new Date().toISOString()}] Fetched ${payslips.length} payslips for employee ${employee_id}`);
        res.json(payslips);
    } catch (err) {
        logError('Error fetching payslips', err);
        res.status(500).json({ error: `Failed to fetch payslips: ${err.message}` });
    }
});

// Error handling
app.use((req, res) => {
    logError('Route not found', new Error(`Invalid route: ${req.originalUrl}`));
    res.status(404).json({ error: 'Route not found' });
});

app.use((err, req, res, next) => {
    logError('Server error', err);
    res.status(500).json({ error: `Internal server error: ${err.message}` });
});

// Start server
app.listen(port, () => {
    console.log(`[${new Date().toISOString()}] Server running at http://localhost:${port}`);
});
