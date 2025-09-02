import { io } from "socket.io-client";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:3000";

class SocketService {
  constructor() {
    this.socket = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.eventHandlers = new Map();
  }

  connect(userData) {
    if (this.socket && this.socket.connected) {
      console.log("Socket already connected");
      return Promise.resolve(this.socket);
    }

    return new Promise((resolve, reject) => {
      try {
        this.socket = io(SOCKET_URL, {
          credentials: true,
          transports: ["websocket", "polling"],
          timeout: 20000,
          forceNew: true,
        });

        // Connection success
        this.socket.on("connect", () => {
          console.log("Socket connected:", this.socket.id);
          this.reconnectAttempts = 0;
          
          // Send user data to server
          this.socket.emit("user:join", userData);
          resolve(this.socket);
        });

        // Connection error
        this.socket.on("connect_error", (error) => {
          console.error("Socket connection error:", error);
          reject(new Error(`Socket connection failed: ${error.message}`));
        });

        // Disconnection handling
        this.socket.on("disconnect", (reason) => {
          console.log("Socket disconnected:", reason);
          
          if (reason === "io server disconnect") {
            // Server disconnected, try to reconnect
            this.handleReconnection();
          }
        });

        // Server error handling
        this.socket.on("error", (error) => {
          console.error("Socket server error:", error);
        });

        // Setup event handlers
        this.setupEventHandlers();

      } catch (error) {
        console.error("Failed to create socket:", error);
        reject(error);
      }
    });
  }

  handleReconnection() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
      
      // Clean up old socket first
      if (this.socket) {
        this.socket.removeAllListeners();
        this.socket.close();
      }
      
      setTimeout(() => {
        // Create new socket connection
        this.socket = io(SOCKET_URL, {
          credentials: true,
          transports: ["websocket", "polling"],
          timeout: 20000,
          forceNew: true,
        });
        
        // Re-setup event handlers
        this.setupEventHandlers();
      }, Math.pow(2, this.reconnectAttempts) * 1000); // Exponential backoff
    } else {
      console.error("Max reconnection attempts reached");
    }
  }

  setupEventHandlers() {
    if (!this.socket) return;

    // Re-add all stored event handlers
    this.eventHandlers.forEach((handler, event) => {
      this.socket.on(event, handler);
    });

    // Basic connection events
    this.socket.on("connect", () => {
      console.log("Socket reconnected:", this.socket.id);
      this.reconnectAttempts = 0;
    });

    this.socket.on("disconnect", (reason) => {
      console.log("Socket disconnected:", reason);
      if (reason === "io server disconnect") {
        this.handleReconnection();
      }
    });

    this.socket.on("connect_error", (error) => {
      console.error("Socket connection error:", error);
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      console.log("Socket disconnected manually");
    }
  }

  // Event handling with error boundaries
  on(event, handler) {
    const wrappedHandler = (...args) => {
      try {
        handler(...args);
      } catch (error) {
        console.error(`Error in socket event handler for ${event}:`, error);
      }
    };

    this.eventHandlers.set(event, wrappedHandler);
    
    if (this.socket) {
      this.socket.on(event, wrappedHandler);
    }
  }

  off(event) {
    this.eventHandlers.delete(event);
    if (this.socket) {
      this.socket.off(event);
    }
  }

  emit(event, data) {
    if (!this.socket || !this.socket.connected) {
      console.error("Socket not connected, cannot emit:", event);
      return false;
    }

    try {
      this.socket.emit(event, data);
      return true;
    } catch (error) {
      console.error(`Failed to emit ${event}:`, error);
      return false;
    }
  }

  // WebRTC signaling methods
  sendOffer(targetUserId, offer, callId) {
    console.log("Sending WebRTC offer:", { targetUserId, callId });
    return this.emit("webrtc:offer", {
      targetUserId,
      offer,
      callId,
    });
  }

  sendAnswer(targetSocketId, answer, callId) {
    return this.emit("webrtc:answer", {
      targetSocketId,
      answer,
      callId,
    });
  }

  sendIceCandidate(targetSocketId, candidate, callId) {
    return this.emit("webrtc:ice-candidate", {
      targetSocketId,
      candidate,
      callId,
    });
  }

  // Chat methods
  sendMessage(targetUserId, message, senderId) {
    return this.emit("chat:message", {
      targetUserId,
      message,
      senderId,
    });
  }

  // Connection status
  isConnected() {
    return this.socket && this.socket.connected;
  }

  getConnectionStatus() {
    if (!this.socket) return "disconnected";
    return this.socket.connected ? "connected" : "connecting";
  }
}

// Create singleton instance
const socketService = new SocketService();

export default socketService;