const express = require("express");
const app = express();
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
dotenv.config();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

mongoose
  .connect(process.env.MONGO_URL)
  .then(() => {
    console.log("Connected to MongoDB");
  })
  .catch((err) => console.log("Hata var", err));

app.listen(process.env.PORT, () => {
  console.log(`Server is running on port ${process.env.PORT}`);
});

app.get("/",(req,res)=>{
        res.status(200).send({
          "success":true,
          "msg":"Node Server Running"
        })
})

const User = require("./models/UserModel");
const Message = require("./models/MessageModel");

//endpoint for user registration

const hashPassword = (userPassword) => {
  const salt = bcrypt.genSaltSync(10);
  const hashedPassword = bcrypt.hashSync(userPassword, salt);
  return hashedPassword;
};

app.post("/register", (req, res) => {
  const { email, password, name, image } = req.body;
  const hashedPasword = hashPassword(password);
  //create a new User object
  const newUser = new User({
    name,
    email,
    password: hashedPasword,
    image,
  });

  //save the user object to database
  newUser
    .save()
    .then((user) => {
      res.status(200).json({ message: "User registered successfully" });
    })
    .catch((err) => {
      console.log(err);
      res.status(500).json({ message: "User registration failed" });
    });
});

//create a token function
const createToken = (userId) => {
  const payload = { userId: userId };
  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "1h" });
  return token;
};

//endpoint for user login
app.post("/login", (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }
  User.findOne({ email })
    .then((user) => {
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      bcrypt.compare(password, user.password, (err, isMatch) => {
        if (err) {
          return res.status(500).json({ message: "Error comparing passwords" });
        }

        if (!isMatch) {
          return res.status(401).json({ message: "Invalid password" });
        }
        //compare the given password with the password of the user
        // if (user.password !== password) {
        //   return res.status(401).json({ messdage: "Invalid password" });
        // }
        //create a token
        const token = createToken(user._id);
        res.status(200).json({ token });
      });
    })
    .catch((err) => {
      console.log(err);
      res.status(500).json({ message: "Login failed" });
    });

  //find the user with the given email
});

//endpoint for getting all users
app.get("/users/:userId", (req, res) => {
  const loggedInUserId = req.params.userId;

  User.find({ _id: { $ne: loggedInUserId } })
    .then((users) => {
      res.status(200).json(users);
    })
    .catch((err) => {
      console.log(err);
      res.status(500).json({ message: "Failed to get users" });
    });
});

//endpoint to send a request to a user

app.post("/friend-request", async (req, res) => {
  const { currentUserId, selectedUserId } = req.body;
  // console.log(currentUserId, selectedUserId);
  try {
    await User.findByIdAndUpdate(selectedUserId, {
      $push: { friendRequests: currentUserId },
    });

    await User.findByIdAndUpdate(currentUserId, {
      $push: { sendFriendRequests: selectedUserId },
    });

    res.status(200).json({ message: "Friend request sent" });
  } catch (error) {
    res.status(500).json({ message: "Failed to send friend request" });
  }
});

//endpoint to show all friend requests of a particular user
app.get("/friend-request/:userId", async (req, res) => {
  const { userId } = req.params;
  try {
    const user = await User.findById(userId)
      .populate("friendRequests", "name email image")
      .lean();
    // console.log(user);
    const friendRequests = user.friendRequests;
    // console.log(friendRequests);

    res.status(200).json(friendRequests);
  } catch (error) {
    res.status(500).json({ message: "Failed to get friend requests" });
  }
});

//endpoint to accept a friend request of a particular user
app.post("/friend-request/accept", async (req, res) => {
  try {
    const { senderId, recepientId } = req.body;

    const sender = await User.findById(senderId);
    const recepient = await User.findById(recepientId);

    sender.friends.push(recepientId);
    recepient.friends.push(senderId);

    recepient.friendRequests = recepient.friendRequests.filter(
      (request) => request.toString() !== senderId.toString()
    );
    sender.sendFriendRequests = sender.sendFriendRequests.filter(
      (request) => request.toString() !== recepientId.toString()
    );

    await sender.save();
    await recepient.save();
    res.status(200).json({ message: "Friend request accepted" });
  } catch (error) {
    res.status(500).json({ message: "Failed to accept friend" });
    console.log(error);
  }
});

app.get("/accepted-friends/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId).populate(
      "friends",
      "name email image"
    );
    const acceptedFriends = user.friends;
    res.json(acceptedFriends);
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Failed to get accepted friends" });
  }
});

const multer = require("multer");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "files/");
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + "-" + file.originalname);
  },
});

const upload = multer({ storage: storage });
//endpoint to post messages and store it in the backend

app.post("/messages", upload.single("imageFile"), async (req, res) => {
  try {
    const { senderId, recepientId, messageType, message } = req.body;
    // console.log(req.file.path);
    const newMessage = new Message({
      senderId,
      recepientId,
      messageType,
      message,
      timeStamp: new Date(),
      imageUrl: messageType === "image" ? req.file.path : null,
    });
    await newMessage.save();
    res.status(200).json({ message: "Message sent" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Failed to send message" });
  }
});

//endpoint to get all messages between two users
app.get("/messages/:senderId/:recepientId", async (req, res) => {
  try {
    const { senderId, recepientId } = req.params;
    const messages = await Message.find({
      $or: [
        { senderId, recepientId },
        { senderId: recepientId, recepientId: senderId },
      ],
    }).populate("senderId", "_id name");

    res.status(200).json(messages);
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Failed to get messages" });
  }
});

app.get("/user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const recepientId = await User.findById(userId);
    res.status(200).json(recepientId);
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Failed to get messages" });
  }
});

//endpoint to delete selected messages

app.post("/deletedMessages", async (req, res) => {
  try {
    const { messages } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ message: "Invalid request" });
    }
    await Message.deleteMany({ _id: { $in: messages } });
    res.status(200).json({ message: "Messages deleted" });
  } catch (error) {
    console.log(error);
  }
});

app.get("/friend-request/sent/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId)
      .populate("sendFriendRequests", "name email image")
      .lean();
    const sentFriendRequests = user.sendFriendRequests;

    res.json(sentFriendRequests);
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Failed to get sent friend requests" });
  }
});

app.get("/friends/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId)
      .populate("friends")
      .then((user) => {
        if (!user) {
          return res.status(404).json({ message: "User not found" });
        }
        const friendIds = user.friends.map((friend) => friend._id);
        res.status(200).json(friendIds);
      })
      .catch((err) => {});
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Failed to get friends" });
  }
});
