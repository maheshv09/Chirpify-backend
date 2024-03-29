const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require("mongodb");
const nodemailer = require("nodemailer");
const bodyParser = require("body-parser");
require("dotenv").config();
const cron = require("node-cron");
const stripe = require("stripe")(`${process.env.STRIPE_PRIVATE_KEY}`);
const multer = require("multer");
const upload = multer({ dest: "uploads/" });
const currentDateTime = new Date();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const MongoUser = process.env.DB_USER;
const MongoPass = process.env.DB_PASS;
const sendGridApiKey = process.env.SENDGRID_API_KEY;
const senderEmail = "chirpify9@gmail.com";

const uri = `mongodb+srv://${MongoUser}:${MongoPass}@cluster0.kgq1cs6.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function connectToDatabase() {
  try {
    await client.connect();
    console.log("Connected to the database");
  } catch (error) {
    console.error("Error connecting to the database:", error);
  }
}

async function disconnectFromDatabase() {
  try {
    await client.close();
    console.log("Disconnected from the database");
  } catch (error) {
    console.error("Error disconnecting from the database:", error);
  }
}

async function sendEmail(recipient, subject, text) {
  const transporter = nodemailer.createTransport({
    service: "SendGrid",
    auth: {
      user: "apikey",
      pass: sendGridApiKey,
    },
  });

  const mailOptions = {
    from: senderEmail,
    to: recipient,
    subject: subject,
    text: text,
  };

  return transporter.sendMail(mailOptions);
}

currentDateTime.setMinutes(currentDateTime.getMinutes() + 1);
const minute = currentDateTime.getMinutes();
const hour = currentDateTime.getHours();
async function resetTodaysTweets() {
  const userCollection = client.db("twitterDB").collection("users");

  await userCollection.updateMany({}, { $set: { todaysTweets: 0 } });

  console.log("TodaysTweets count reset successfully.");
  const email = "vaswani.mahesh2012@gmail.com"; // Change to your email for testing
  const subject = "TodaysTweets Count Reset";
  const text = "The todaysTweets count has been reset successfully.";
  await sendEmail(email, subject, text);
  console.log("Debug: Email sent after todaysTweets count reset.");
}
cron.schedule("0 0 * * *", resetTodaysTweets, {
  timezone: "Asia/Kolkata",
  once: true,
});
async function run() {
  try {
    await connectToDatabase();
    cron.schedule("0 0 * * *", resetTodaysTweets, { timezone: "Asia/Kolkata" });
    const postCollection = client.db("twitterDB").collection("posts");
    //console.log("HeY:", postCollection);
    const userCollection = client.db("twitterDB").collection("users");
    const premiumRequestsCollection = client
      .db("twitterDB")
      .collection("PremiumRequests");

    app.get("/getPosts", async (req, res) => {
      const posts = (await postCollection.find().toArray()).reverse();
      res.send(posts);
    });

    app.get("/user", async (req, res) => {
      const user = await userCollection.find().toArray();
      res.send(user);
    });

    app.get("/loggedInUser", async (req, res) => {
      const email = req.query.email;
      const user = await userCollection.find({ email: email }).toArray();
      res.send(user);
    });

    app.get("/userPost", async (req, res) => {
      const email = req.query.email;
      const userPosts = (
        await postCollection.find({ email: email }).toArray()
      ).reverse();
      res.send(userPosts);
    });

    app.post("/post", async (req, res) => {
      const post = req.body;
      const result = await postCollection.insertOne(post);
      res.send(result);
    });

    app.post("/register", async (req, res) => {
      const user = req.body;
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    app.post(
      "/applyForPremiumBadge",
      upload.single("identityDocument"),
      async (req, res) => {
        try {
          const { name, email, reason, socialMediaProfiles, identityDocument } =
            req.body;

          const user = await userCollection.findOne({ email: email });

          if (!user) {
            return res
              .status(404)
              .json({ success: false, message: "User not found" });
          }

          const premiumRequest = {
            userId: user.userId,
            name: user.name,
            email: user.email,
            reason,
            socialMediaProfiles,
            identityDocument,
          };

          await premiumRequestsCollection.insertOne(premiumRequest);

          res.status(200).json({
            success: true,
            message: "Application submitted successfully",
          });
        } catch (error) {
          console.error("Error submitting application:", error);
          res
            .status(500)
            .json({ success: false, message: "Error submitting application" });
        }
      }
    );

    app.patch("/userUpdates/:email", async (req, res) => {
      const filter = req.params;
      const profile = req.body;
      const options = { upsert: true };
      const updateDoc = { $set: profile };
      const result = await userCollection.updateOne(filter, updateDoc, options);
      res.send(result);
    });
    // Assuming you have initialized your express app
    app.patch("/cancelSubscription/:email", async (req, res) => {
      try {
        const email = req.params.email;
        // Assuming you are using a MongoDB or similar database
        const user = await userCollection.findOneAndUpdate(
          { email },
          {
            $unset: { subscriptionType: "" },
            $set: { allowedTweets: 1, todaysTweets: 0 },
          }
        );
        if (!user) {
          return res.status(404).json({ error: "User not found" });
        }
        res.status(200).json({ message: "Subscription canceled successfully" });
      } catch (error) {
        console.error("Error canceling subscription:", error);
        res.status(500).json({ error: "Failed to cancel subscription" });
      }
    });

    app.post("/sendEmail", async (req, res) => {
      const { to, subject, text } = req.body;

      try {
        const result = await sendEmail(to, subject, text);
        console.log("Email sent successfully:", result);
        res.send({ success: true, message: "Email sent successfully" });
      } catch (error) {
        console.error("Error sending email:", error);
        res
          .status(500)
          .send({ success: false, message: "Error sending email" });
      }
    });
    app.get("/getStripeClientSecret/:subscriptionType", async (req, res) => {
      const { subscriptionType } = req.params;

      try {
        const price = subscriptionType === "silver" ? 100 : 1000;

        const paymentIntent = await stripe.paymentIntents.create({
          amount: price,
          currency: "inr",
          description: "Payment proccessed",
        });

        res.json({ clientSecret: paymentIntent.client_secret });
      } catch (error) {
        console.error("Error creating PaymentIntent:", error);
        res.status(500).json({ error: "Error creating PaymentIntent" });
      }
    });
    app.get("/success", async (req, res) => {
      res.send("Payment was successful!");
    });
    app.get("/", (req, res) => {
      res.send("Hello from Twitter!");
    });
    app.get("/isVerified/:email", async (req, res) => {
      const verifUser = await userCollection.findOne({
        email: req.params.email,
      });
      console.log("User", req.params.email, verifUser);
      verifUser.premiumVerificationApplied
        ? verifUser.premiumVerificationApplied == "approved"
          ? res.status(200).json({
              success: true,
              message: "Verified user",
            })
          : res.status(201).json({
              success: false,
              message: "Not verified user",
            })
        : res.status(201).json({
            success: false,
            message: "Not verified user",
          });
    });
    app.get("/admin/premiumVerificationRequests", async (req, res) => {
      try {
        const requests = await premiumRequestsCollection.find().toArray();

        const data = [];
        for (const request of requests) {
          const user = await userCollection.findOne({ email: request.email });
          if (user) {
            data.push({
              requestId: request._id,
              userId: user.userId,
              name: user.name,
              email: user.email,
              reason: request.reason,
              socialMediaProfiles: request.socialMediaProfiles,
              identityDocument: request.identityDocument,
              premiumVerificationApplied: user.premiumVerificationApplied,
            });
          }
        }

        res.status(200).json({ success: true, data });
      } catch (error) {
        console.error("Error fetching premium verification requests:", error);
        res.status(500).json({
          success: false,
          message: "Error fetching premium verification requests",
        });
      }
    });

    app.put(
      "/admin/approvePremiumVerificationRequest/:email",
      async (req, res) => {
        const userEmail = req.params.email;

        try {
          await premiumRequestsCollection.findOneAndDelete({
            email: userEmail,
          });

          await userCollection.updateOne(
            { email: userEmail },
            { $set: { premiumVerificationApplied: "approved" } }
          );

          res.status(200).json({
            success: true,
            message: "Premium verification request approved",
          });
        } catch (error) {
          console.error("Error approving premium verification request:", error);
          res.status(500).json({
            success: false,
            message: "Error approving premium verification request",
          });
        }
      }
    );
    app.put(
      "/admin/rejectPremiumVerificationRequest/:email",
      async (req, res) => {
        const userEmail = req.params.email;

        try {
          await premiumRequestsCollection.findOneAndDelete({
            email: userEmail,
          });

          await userCollection.updateOne(
            { email: userEmail },
            { $set: { premiumVerificationApplied: "rejected" } }
          );

          res.status(200).json({
            success: true,
            message: "Premium verification request rejected",
          });
        } catch (error) {
          console.error("Error rejecting premium verification request:", error);
          res.status(500).json({
            success: false,
            message: "Error rejecting premium verification request",
          });
        }
      }
    );

    app.listen(port, () => {
      console.log(`Twitter listening on port ${port}`);
    });
  } finally {
  }
}

run().catch(console.dir);

module.exports = app;
