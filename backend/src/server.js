import express from "express";
import "dotenv/config";
import cookieParser from "cookie-parser";
import cors from "cors";
import path from "path";
import { createServer } from "http";
import { Server } from "socket.io";

import authRoutes from "./routes/auth.route.js";
import userRoutes from "./routes/user.route.js";
import chatRoutes from "./routes/chat.route.js";

import { connectDB } from "./lib/db.js";
import Message from "./models/Message.js";

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 5001;

const __dirname = path.resolve();

const allowedOrigins = [
  "http://localhost:5173",
  "https://globalingo-e2yi.onrender.com",
  /^https:\/\/.*\.onrender\.com$/
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      
      if (allowedOrigins.some(allowed => {
        if (typeof allowed === 'string') return allowed === origin;
        return allowed.test(origin);
      })) {
        return callback(null, true);
      }
      
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);

app.use(express.json());
app.use(cookieParser());

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/chat", chatRoutes);



if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "../frontend/dist")));

  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend", "dist", "index.html"));
  });
}

// Socket.io setup with error handling
const io = new Server(server, {
  cors: {
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      
      if (allowedOrigins.some(allowed => {
        if (typeof allowed === 'string') return allowed === origin;
        return allowed.test(origin);
      })) {
        return callback(null, true);
      }
      
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  },
});

// Store active users and rooms
const activeUsers = new Map();
const activeRooms = new Map();

io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Error handling for socket connections
  socket.on("error", (error) => {
    console.error(`Socket error for ${socket.id}:`, error);
  });

  // User joins with authentication
  socket.on("user:join", (userData) => {
    try {
      activeUsers.set(socket.id, {
        ...userData,
        socketId: socket.id,
        joinedAt: new Date(),
      });
      console.log(`User ${userData.fullName} joined`);
      
      // Broadcast user online status
      socket.broadcast.emit("user:online", {
        userId: userData._id,
        socketId: socket.id,
      });
    } catch (error) {
      console.error("Error in user:join:", error);
      socket.emit("error", { message: "Failed to join" });
    }
  });

  // Chat message handling with database persistence
  socket.on("chat:message", async (data) => {
    try {
      const { targetUserId, message, senderId, messageType, fileUrl, fileName, fileSize, replyTo } = data;
      const timestamp = new Date();
      
      // Create conversation ID (consistent ordering)
      const conversationId = [senderId, targetUserId].sort().join("-");
      
      // Save message to database
      const messageData = {
        senderId,
        receiverId: targetUserId,
        text: message,
        conversationId,
        messageType: messageType || "text",
      };
      
      // Add optional fields if present
      if (fileUrl) messageData.fileUrl = fileUrl;
      if (fileName) messageData.fileName = fileName;
      if (fileSize) messageData.fileSize = fileSize;
      if (replyTo) messageData.replyTo = replyTo;
      
      const savedMessage = await Message.create(messageData);

      // Populate sender info for real-time delivery
      await savedMessage.populate("senderId", "fullName profilePic");
      
      // Find target user's socket
      console.log("Looking for target user:", targetUserId);
      console.log("Active users:", Array.from(activeUsers.entries()).map(([id, user]) => ({socketId: id, userId: user._id, name: user.fullName})));
      
      const targetSocket = Array.from(activeUsers.entries()).find(
        ([_, user]) => user._id.toString() === targetUserId.toString()
      );

      // Send to target user if online
      if (targetSocket) {
        const [targetSocketId] = targetSocket;
        console.log("Sending message to target user:", targetSocketId);
        io.to(targetSocketId).emit("chat:message", {
          _id: savedMessage._id,
          message: savedMessage.text,
          senderId: savedMessage.senderId._id,
          senderName: savedMessage.senderId.fullName,
          senderPic: savedMessage.senderId.profilePic,
          timestamp: savedMessage.createdAt,
          conversationId: savedMessage.conversationId,
          messageType: savedMessage.messageType,
          fileUrl: savedMessage.fileUrl,
          fileName: savedMessage.fileName,
          fileSize: savedMessage.fileSize,
          replyTo: savedMessage.replyTo,
          reactions: savedMessage.reactions || [],
        });
      } else {
        console.log("Target user not found online for:", targetUserId);
      }

      // Send confirmation back to sender
      socket.emit("chat:message:sent", {
        _id: savedMessage._id,
        message: savedMessage.text,
        targetUserId,
        timestamp: savedMessage.createdAt,
        conversationId: savedMessage.conversationId,
        messageType: savedMessage.messageType,
        fileUrl: savedMessage.fileUrl,
        fileName: savedMessage.fileName,
        fileSize: savedMessage.fileSize,
        replyTo: savedMessage.replyTo,
        reactions: savedMessage.reactions || [],
      });

    } catch (error) {
      console.error("Error in chat:message:", error);
      socket.emit("error", { message: "Failed to send message" });
    }
  });

  // Get chat history
  socket.on("chat:get-history", async (data) => {
    try {
      const { targetUserId, userId, limit = 50 } = data;
      const conversationId = [userId, targetUserId].sort().join("-");
      
      const messages = await Message.find({ conversationId })
        .populate("senderId", "fullName profilePic")
        .populate("replyTo")
        .sort({ createdAt: -1 })
        .limit(limit);

      socket.emit("chat:history", {
        conversationId,
        messages: messages.reverse().map(msg => ({
          _id: msg._id,
          message: msg.text,
          senderId: msg.senderId._id,
          senderName: msg.senderId.fullName,
          senderPic: msg.senderId.profilePic,
          timestamp: msg.createdAt,
          conversationId: msg.conversationId,
          messageType: msg.messageType,
          fileUrl: msg.fileUrl,
          fileName: msg.fileName,
          fileSize: msg.fileSize,
          replyTo: msg.replyTo?._id,
          reactions: msg.reactions || [],
          isEdited: msg.isEdited || false,
          editedAt: msg.editedAt,
          isDeleted: msg.isDeleted || false,
          deletedAt: msg.deletedAt,
        }))
      });

    } catch (error) {
      console.error("Error getting chat history:", error);
      socket.emit("error", { message: "Failed to load chat history" });
    }
  });

  // Handle message reactions
  socket.on("message:react", async (data) => {
    try {
      const { messageId, emoji, userId } = data;
      
      const message = await Message.findById(messageId);
      if (!message) {
        socket.emit("error", { message: "Message not found" });
        return;
      }

      // Check if user already reacted with this emoji
      const existingReaction = message.reactions.find(
        r => r.userId.toString() === userId && r.emoji === emoji
      );

      if (existingReaction) {
        // Remove reaction
        message.reactions = message.reactions.filter(
          r => !(r.userId.toString() === userId && r.emoji === emoji)
        );
      } else {
        // Add reaction
        message.reactions.push({ userId, emoji });
      }

      await message.save();

      // Broadcast to both users
      const targetSocket = Array.from(activeUsers.entries()).find(
        ([_, user]) => user._id === message.receiverId.toString()
      );
      const senderSocket = Array.from(activeUsers.entries()).find(
        ([_, user]) => user._id === message.senderId.toString()
      );

      const reactionData = {
        messageId,
        reactions: message.reactions,
        userId,
        emoji,
        action: existingReaction ? "removed" : "added"
      };

      if (targetSocket) {
        io.to(targetSocket[0]).emit("message:reaction", reactionData);
      }
      if (senderSocket) {
        io.to(senderSocket[0]).emit("message:reaction", reactionData);
      }

    } catch (error) {
      console.error("Error handling reaction:", error);
      socket.emit("error", { message: "Failed to add reaction" });
    }
  });

  // Handle message edit
  socket.on("message:edit", async (data) => {
    try {
      const { messageId, newText, userId } = data;
      
      const message = await Message.findById(messageId);
      if (!message) {
        socket.emit("error", { message: "Message not found" });
        return;
      }

      // Check if user is the sender
      if (message.senderId.toString() !== userId) {
        socket.emit("error", { message: "You can only edit your own messages" });
        return;
      }

      // Update message
      message.text = newText;
      message.isEdited = true;
      message.editedAt = new Date();
      await message.save();

      // Broadcast to both users
      const targetSocket = Array.from(activeUsers.entries()).find(
        ([_, user]) => user._id === message.receiverId.toString()
      );
      const senderSocket = Array.from(activeUsers.entries()).find(
        ([_, user]) => user._id === message.senderId.toString()
      );

      const editData = {
        messageId,
        newText,
        editedAt: message.editedAt,
        userId
      };

      if (targetSocket) {
        io.to(targetSocket[0]).emit("message:edited", editData);
      }
      if (senderSocket) {
        io.to(senderSocket[0]).emit("message:edited", editData);
      }

    } catch (error) {
      console.error("Error editing message:", error);
      socket.emit("error", { message: "Failed to edit message" });
    }
  });

  // Handle message delete
  socket.on("message:delete", async (data) => {
    try {
      const { messageId, userId } = data;
      
      const message = await Message.findById(messageId);
      if (!message) {
        socket.emit("error", { message: "Message not found" });
        return;
      }

      // Check if user is the sender
      if (message.senderId.toString() !== userId) {
        socket.emit("error", { message: "You can only delete your own messages" });
        return;
      }

      // Mark message as deleted instead of actually deleting it
      message.text = "This message was deleted";
      message.isDeleted = true;
      message.deletedAt = new Date();
      await message.save();

      // Broadcast to both users
      const targetSocket = Array.from(activeUsers.entries()).find(
        ([_, user]) => user._id === message.receiverId.toString()
      );
      const senderSocket = Array.from(activeUsers.entries()).find(
        ([_, user]) => user._id === message.senderId.toString()
      );

      const deleteData = {
        messageId,
        deletedAt: message.deletedAt,
        userId
      };

      if (targetSocket) {
        io.to(targetSocket[0]).emit("message:deleted", deleteData);
      }
      if (senderSocket) {
        io.to(senderSocket[0]).emit("message:deleted", deleteData);
      }

    } catch (error) {
      console.error("Error deleting message:", error);
      socket.emit("error", { message: "Failed to delete message" });
    }
  });

  // ============================================
  // WEBRTC VIDEO CALL SIGNALING (GitHub Working Implementation)
  // ============================================
  
  // Send socket ID to client (required for working implementation)
  socket.emit("me", socket.id);

  // Video call invitation (keep for chat integration)
  socket.on("videoCallInvitation", ({ targetUserId, callerName, meetingId, callUrl }) => {
    try {
      console.log("📹 Video call invitation:", { targetUserId, callerName, meetingId });
      
      const targetSocket = Array.from(activeUsers.entries()).find(
        ([_, user]) => user._id.toString() === targetUserId.toString()
      );

      if (targetSocket) {
        const [targetSocketId] = targetSocket;
        io.to(targetSocketId).emit("videoCallInvitation", {
          callerName,
          meetingId,
          callUrl
        });
        console.log(`✅ Video call invitation sent to ${targetSocket[1].fullName}`);
      } else {
        console.log("❌ Target user not found");
      }
    } catch (error) {
      console.error("Error in videoCallInvitation:", error);
    }
  });

  // Handle simple room joining for video calls
  socket.on("joinVideoCallRoom", ({ meetingId, socketId, userName, userId, nativeLanguage }) => {
    try {
      console.log("🏠 Joining video call room:", { meetingId, socketId, userName });
      
      // Join the room
      socket.join(meetingId);
      
      // Get room size
      const roomSockets = io.sockets.adapter.rooms.get(meetingId);
      const roomSize = roomSockets ? roomSockets.size : 0;
      
      console.log("📊 Room", meetingId, "now has", roomSize, "people");
      
      if (roomSize === 1) {
        // First person - wait for other
        socket.videoUserName = userName;
        socket.videoNativeLanguage = nativeLanguage;
        socket.emit("roomRole", { 
          role: "waiter", 
          message: "Waiting for other participant..." 
        });
      } else if (roomSize === 2) {
        // Second person - you should call the first person
        const firstPersonSocket = Array.from(roomSockets).find(id => id !== socket.id);
        const firstSocket = io.sockets.sockets.get(firstPersonSocket);
        
        // Store names and languages on sockets for reference
        socket.videoUserName = userName;
        socket.videoNativeLanguage = nativeLanguage;
        
        if (firstSocket) {
          // Tell second person to call first person (with first person's info)
          socket.emit("roomRole", { 
            role: "caller", 
            otherSocketId: firstPersonSocket,
            otherUserName: firstSocket.videoUserName || "Other participant",
            otherUserLanguage: firstSocket.videoNativeLanguage || 'en-US',
            message: "Ready to start call" 
          });
          
          // Tell first person who will call them (with second person's info)
          firstSocket.emit("expectingCallFrom", { 
            socketId: socket.id, 
            userName: userName,
            userLanguage: nativeLanguage || 'en-US'
          });
        }
      }
      
    } catch (error) {
      console.error("Error in joinVideoCallRoom:", error);
    }
  });

  // Handle call user (exact match to GitHub implementation)
  socket.on("callUser", (data) => {
    try {
      console.log("📞 CallUser:", data);
      io.to(data.userToCall).emit("callUser", {
        signal: data.signalData,
        from: data.from,
        name: data.name
      });
    } catch (error) {
      console.error("Error in callUser:", error);
    }
  });

  // Handle answer call (exact match to GitHub implementation)
  socket.on("answerCall", (data) => {
    try {
      console.log("✅ AnswerCall:", data);
      io.to(data.to).emit("callAccepted", data.signal);
    } catch (error) {
      console.error("Error in answerCall:", error);
    }
  });

  // Handle call ended (exact match to GitHub implementation)
  socket.on("callEnded", () => {
    try {
      console.log("📞 CallEnded from:", socket.id);
      socket.broadcast.emit("callEnded");
    } catch (error) {
      console.error("Error in callEnded:", error);
    }
  });

  // Disconnection handling
  socket.on("disconnect", () => {
    try {
      const user = activeUsers.get(socket.id);
      if (user) {
        console.log(`User ${user.fullName} disconnected`);
        
        // Broadcast user offline status
        socket.broadcast.emit("user:offline", {
          userId: user._id,
          socketId: socket.id,
        });
        
        activeUsers.delete(socket.id);
      }

      // Handle video call room disconnection
      if (socket.roomId) {
        console.log(`📹 User ${socket.userName} left room ${socket.roomId}`);
        
        // Notify others in the room
        socket.to(socket.roomId).emit("user-left", {
          socketId: socket.id,
          userName: socket.userName,
          userId: socket.userId
        });
      }
    } catch (error) {
      console.error("Error in disconnect:", error);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Socket.io server initialized`);

  connectDB();
});
