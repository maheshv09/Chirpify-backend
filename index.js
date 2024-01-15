const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require("mongodb");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const MongoUser = process.env.DB_USER;
const MongoPass = process.env.DB_PASS;
// console.log("HEYY", MongoUser);
// console.log("HE", MongoPass);
const uri = `mongodb+srv://${MongoUser}:${MongoPass}@cluster0.kgq1cs6.mongodb.net/?retryWrites=true&w=majority`;

// Move client creation outside of the run function
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

async function run() {
  try {
    await connectToDatabase();

    const postCollection = client.db("twitterDB").collection("posts");
    //console.log("HeY:", postCollection);
    const userCollection = client.db("twitterDB").collection("users");

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

    app.patch("/userUpdates/:email", async (req, res) => {
      const filter = req.params;
      const profile = req.body;
      const options = { upsert: true };
      const updateDoc = { $set: profile };
      const result = await userCollection.updateOne(filter, updateDoc, options);
      res.send(result);
    });

    app.get("/", (req, res) => {
      res.send("Hello from Twitter!");
    });

    app.listen(port, () => {
      console.log(`Twitter listening on port ${port}`);
    });
  } finally {
  }
}

run().catch(console.dir);

module.exports = app;
