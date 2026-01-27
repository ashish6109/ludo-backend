const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json()); // <-- JSON body parsing

// --- MongoDB Connection ---
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("MongoDB Connected"))
.catch(err => console.log("Mongo DB Error:", err));

// --- User Model ---
const UserSchema = new mongoose.Schema({
  email: String,
  password: String,
  wallet: { type: Number, default: 0 }
});
const User = mongoose.model("User", UserSchema);

// --- Transaction Model ---
const TxnSchema = new mongoose.Schema({
  userId: String,
  amount: Number,
  type: String,
  status: String,
});
const Transaction = mongoose.model("Transaction", TxnSchema);

// --- Routes ---

// Check backend
app.get("/", (req, res) => {
  res.send("Backend is running with DB & JSON support ✔");
});

// Webhook Endpoint (GoCreator)
app.post("/webhook/gocreator", async (req, res) => {
  console.log("Webhook data:", req.body);

  const { email, amount, status } = req.body;

  if (status === "paid") {
    const user = await User.findOne({ email });
    if (user) {
      user.wallet += amount;
      await user.save();

      await Transaction.create({
        userId: user._id,
        amount,
        type: "deposit",
        status: "success",
      });
    }
  }

  res.status(200).send("WEBHOOK_OK");
});

// Start Server
app.listen(10000, () => console.log("Server running on port 10000"));
