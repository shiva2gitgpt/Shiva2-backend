const express = require("express");
const cors = require("cors");

const app = express();

const PORT = process.env.PORT || 3000;

app.use(cors());

app.use(express.json());


/* GET API */

app.get("/api/status", (req, res) => {

    res.json({
        success: true,
        message: "Shiva 2.0 Backend is working! 🚀"
    });

});


/* POST API */

app.post("/api/message", (req, res) => {

    const name = req.body.name;

    if (!name) {

        return res.status(400).json({
            success: false,
            message: "Name is required."
        });

    }

    res.json({
        success: true,
        message:
            "Hello " +
            name +
            "! Backend received your data. 🚀"
    });

});


/* SERVER */

app.listen(PORT, "0.0.0.0", () => {

    console.log(
        `Backend running on http://127.0.0.1:${PORT}`
    );

});