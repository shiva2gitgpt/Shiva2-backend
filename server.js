const express = require("express");
const cors = require("cors");

const app = express();
const PORT = 3000;

app.use(cors());

app.get("/api/status", (req, res) => {
    res.json({
        success: true,
        message: "Shiva 2.0 Backend is working! 🚀"
    });
});

app.listen(PORT, () => {
    console.log(`Backend running on http://127.0.0.1:${PORT}`);
});