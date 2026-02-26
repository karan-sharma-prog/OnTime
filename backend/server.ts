import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import dotenv from "dotenv";
import dns from "node:dns";

// Force Google DNS to fix Atlas SRV lookup issues on some networks
dns.setServers(['8.8.8.8', '8.8.4.4']);
import {
  Department, ClassSession, User, Timetable, Leave, Substitution, Notification,
  seedDepartments
} from "./models.js";

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || "super-secret-key";
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/edusched";

async function startServer() {
  // Connect to MongoDB
  try {
    await mongoose.connect(MONGODB_URI, { family: 4 });
    console.log("Connected to MongoDB");
    await seedDepartments();
  } catch (err) {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  }

  const app = express();
  const PORT = 3000;

  app.use(cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
    credentials: true,
  }));
  app.use(express.json());

  // --- Auth Middleware ---
  const authenticateToken = (req: any, res: any, next: any) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
      if (err) return res.sendStatus(403);
      req.user = user;
      next();
    });
  };

  // --- API Routes ---

  // Auth
  app.post("/api/auth/signup", async (req, res) => {
    const { name, email, password, department_id, subject_specialization, employee_id } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    try {
      const newUser = await User.create({
        name, email, password: hashedPassword,
        department_id, subject_specialization, employee_id
      });

      const user = { id: newUser._id, email, name };
      const token = jwt.sign(user, JWT_SECRET);
      res.json({ token, user });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // Class Sessions
  app.get("/api/class-sessions", authenticateToken, async (req: any, res) => {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: "Date parameter is required" });

    const sessions = await ClassSession.find({ teacher_id: req.user.id, date }).lean();
    res.json(sessions.map(s => ({ ...s, id: s._id })));
  });

  app.post("/api/class-sessions", authenticateToken, async (req: any, res) => {
    const { timetable_id, date, status } = req.body;

    if (!timetable_id || !date || !['taken', 'not_taken'].includes(status)) {
      return res.status(400).json({ error: "Invalid data provided" });
    }

    try {
      // Upsert: update if it exists for this slot & date, otherwise create
      const session = await ClassSession.findOneAndUpdate(
        { timetable_id, date, teacher_id: req.user.id },
        { status },
        { new: true, upsert: true }
      );
      res.json({ success: true, session });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    const token = jwt.sign({
      id: user._id, email: user.email, name: user.name, role: user.role
    }, JWT_SECRET);
    res.json({
      token,
      user: {
        id: user._id, email: user.email, name: user.name,
        role: user.role, department_id: user.department_id
      }
    });
  });

  // User Profile
  app.get("/api/user/me", authenticateToken, async (req: any, res) => {
    const user = await User.findById(req.user.id).lean();
    if (!user) return res.sendStatus(404);

    const dept = user.department_id
      ? await Department.findById(user.department_id).lean()
      : null;

    res.json({ ...user, department_name: dept?.name || null });
  });

  // Departments
  app.get("/api/departments", async (req, res) => {
    const depts = await Department.find().lean();
    // Map _id to id for frontend compatibility
    res.json(depts.map(d => ({ id: d._id, name: d.name })));
  });

  // Timetable
  app.get("/api/timetable", authenticateToken, async (req: any, res) => {
    const teacherId = req.query.teacherId || req.user.id;
    const timetable = await Timetable.find({ teacher_id: teacherId }).lean();
    res.json(timetable.map(t => ({ ...t, id: t._id })));
  });

  app.post("/api/timetable", authenticateToken, async (req: any, res) => {
    const { day, start_time, end_time, subject, room, block, class_name } = req.body;
    const entry = await Timetable.create({
      teacher_id: req.user.id, day, start_time, end_time, subject,
      room: room || '', block: block || '', class_name: class_name || ''
    });
    res.json({ id: entry._id });
  });

  app.delete("/api/timetable/:id", authenticateToken, async (req: any, res) => {
    await Timetable.deleteOne({ _id: req.params.id, teacher_id: req.user.id });
    res.sendStatus(200);
  });

  app.post("/api/timetable/upload", authenticateToken, async (req: any, res) => {
    const entries = req.body;

    if (!Array.isArray(entries)) {
      return res.status(400).json({ error: "Invalid data format" });
    }

    try {
      // Clear existing timetable for this teacher
      await Timetable.deleteMany({ teacher_id: req.user.id });

      // Insert all new entries
      const docs = entries.map(entry => ({
        teacher_id: req.user.id,
        day: entry.day,
        start_time: entry.start_time,
        end_time: entry.end_time,
        subject: entry.subject,
        room: entry.room || '',
        block: entry.block || '',
        class_name: entry.class_name || ''
      }));
      await Timetable.insertMany(docs);

      res.json({ success: true, count: entries.length });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Leave & Substitution
  app.post("/api/leave", authenticateToken, async (req: any, res) => {
    const { date, start_time, end_time } = req.body;
    const leave = await Leave.create({
      teacher_id: req.user.id, date, start_time, end_time
    });
    res.json({ id: leave._id });
  });

  app.get("/api/substitutes/suggest", authenticateToken, async (req: any, res) => {
    const { day, start_time, end_time, subject, department_id } = req.query;

    // Find teachers who ARE busy at this time
    const busyTeacherIds = await Timetable.distinct('teacher_id', {
      day,
      $or: [
        { start_time: { $lte: start_time }, end_time: { $gt: start_time } },
        { start_time: { $lt: end_time }, end_time: { $gte: end_time } },
        { $and: [{ start_time: { $gte: start_time } }, { start_time: { $lt: end_time } }] }
      ]
    });

    // Find all teachers NOT busy and NOT the requesting teacher
    const availableTeachers = await User.find({
      _id: { $nin: [...busyTeacherIds, req.user.id] }
    }).populate('department_id').lean();

    const result = availableTeachers.map((t: any) => ({
      id: t._id,
      name: t.name,
      department_id: t.department_id?._id,
      department_name: t.department_id?.name || '',
      subject_specialization: t.subject_specialization
    }));

    // Sort by priority: Same dept first, then same subject
    result.sort((a, b) => {
      if (String(a.department_id) === department_id && String(b.department_id) !== department_id) return -1;
      if (String(a.department_id) !== department_id && String(b.department_id) === department_id) return 1;
      if (a.subject_specialization === subject && b.subject_specialization !== subject) return -1;
      if (a.subject_specialization !== subject && b.subject_specialization === subject) return 1;
      return 0;
    });

    res.json(result);
  });

  app.post("/api/substitutions", authenticateToken, async (req: any, res) => {
    const { leave_id, substitute_teacher_id, date, start_time, end_time, original_teacher_id } = req.body;

    try {
      // Create substitution record as PENDING
      const sub = await Substitution.create({
        leave_id, original_teacher_id, substitute_teacher_id,
        date, start_time, end_time, status: 'pending'
      });

      // Notify substitute with a REQUEST type
      await Notification.create({
        user_id: substitute_teacher_id,
        message: `Substitution Request: ${req.user.name} requested you to cover a class on ${date} at ${start_time} - ${end_time}`,
        type: 'request',
        related_id: sub._id
      });

      res.status(201).json({ success: true, substitution_id: sub._id });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.patch("/api/substitutions/:id/respond", authenticateToken, async (req: any, res) => {
    const { status } = req.body; // 'confirmed' or 'rejected'
    if (!['confirmed', 'rejected'].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    try {
      const sub = await Substitution.findById(req.params.id);
      if (!sub) return res.status(404).json({ error: "Substitution not found" });
      if (sub.substitute_teacher_id.toString() !== req.user.id) {
        return res.status(403).json({ error: "Not authorized to respond to this request" });
      }

      sub.status = status;
      await sub.save();

      const originalTeacher = await User.findById(sub.original_teacher_id);
      const substituteTeacher = await User.findById(sub.substitute_teacher_id);

      if (status === 'confirmed') {
        // Update class counts
        await User.updateOne({ _id: sub.substitute_teacher_id }, { $inc: { extra_classes: 1 } });
        await User.updateOne({ _id: sub.original_teacher_id }, { $inc: { extra_classes: -1 } });

        // Update leave status
        await Leave.updateOne({ _id: sub.leave_id }, { status: "substituted" });

        // Notify Original Teacher
        await Notification.create({
          user_id: sub.original_teacher_id,
          message: `Substitution Confirmed: ${substituteTeacher?.name} accepted your request for ${sub.date} at ${sub.start_time}`,
          type: 'confirmation',
          related_id: sub._id
        });

        // Detailed Notification to both (already sent to original, now more detail for substitute)
        await Notification.create({
          user_id: sub.substitute_teacher_id,
          message: `Substitution Schedule: You are covering for ${originalTeacher?.name} on ${sub.date}, ${sub.start_time} - ${sub.end_time}.`,
          type: 'reminder',
          related_id: sub._id
        });
      } else {
        // Notify Original Teacher about rejection
        await Notification.create({
          user_id: sub.original_teacher_id,
          message: `Substitution Rejected: ${substituteTeacher?.name} declined your request for ${sub.date} at ${sub.start_time}`,
          type: 'reminder',
          related_id: sub._id
        });
      }

      res.json({ success: true, status });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Helper to check and create class reminders
  const checkAndCreateReminders = async (userId: string) => {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const todayName = dayNames[new Date().getDay()];
    const now = new Date();
    const currentTime = now.toTimeString().slice(0, 5); // HH:MM

    // Target time: 5 minutes from now
    const reminderTime = new Date(now.getTime() + 5 * 60000).toTimeString().slice(0, 5);

    const upcomingClasses = await Timetable.find({
      teacher_id: userId,
      day: todayName,
      start_time: reminderTime
    }).lean();

    for (const c of upcomingClasses) {
      const message = `Class Reminder: Your ${c.subject} class is in ${c.block} ${c.room} in 5 minutes.`;
      // Ensure we don't create duplicate for the same slot today
      const todayStr = now.toISOString().split('T')[0];
      const exists = await Notification.findOne({
        user_id: userId,
        message: { $regex: new RegExp(c.subject, 'i') },
        created_at: { $gte: new Date(todayStr) }
      });

      if (!exists) {
        await Notification.create({
          user_id: userId,
          message,
          type: 'reminder',
          related_id: c._id
        });
      }
    }
  };

  // Notifications
  app.get("/api/notifications", authenticateToken, async (req: any, res) => {
    await checkAndCreateReminders(req.user.id);
    const notifications = await Notification.find({ user_id: req.user.id })
      .sort({ created_at: -1 }).lean();
    res.json(notifications.map(n => ({ ...n, id: n._id })));
  });

  // Dashboard Stats
  app.get("/api/dashboard/stats", authenticateToken, async (req: any, res) => {
    await checkAndCreateReminders(req.user.id);
    const user = await User.findById(req.user.id).lean();
    if (!user) return res.sendStatus(404);

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const todayName = dayNames[new Date().getDay()];
    const today = new Date().toISOString().split('T')[0];

    const todayClasses = await Timetable.find({
      teacher_id: req.user.id, day: todayName
    }).lean();

    const substitutions = await Substitution.find({
      substitute_teacher_id: req.user.id, date: today
    }).lean();

    res.json({
      extra_classes: user.extra_classes,
      today_classes: todayClasses.map(c => ({ ...c, id: c._id })),
      today_substitutions: substitutions.map(s => ({ ...s, id: s._id }))
    });
  });

  app.get("/api/teachers/free", authenticateToken, async (req: any, res) => {
    const { day, time } = req.query;
    const currentTime = (time as string) || new Date().toTimeString().slice(0, 5);
    const currentDay = (day as string) || ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date().getDay()];

    const busyTeacherIds = await Timetable.distinct('teacher_id', {
      day: currentDay,
      start_time: { $lte: currentTime },
      end_time: { $gt: currentTime }
    });

    const freeTeachers = await User.find({
      _id: { $nin: busyTeacherIds }
    }).populate('department_id').lean();

    res.json(freeTeachers.map((t: any) => ({
      id: t._id,
      name: t.name,
      department_name: t.department_id?.name || '',
      subject_specialization: t.subject_specialization
    })));
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
