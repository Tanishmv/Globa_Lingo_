import socketService from "./socket.js";

export const testConnections = async () => {
  const results = {
    timestamp: new Date(),
    overall: "pending",
    tests: {
      webrtc: { status: "pending", details: null, error: null },
      socket: { status: "pending", details: null, error: null },
      media: { status: "pending", details: null, error: null },
      network: { status: "pending", details: null, error: null },
    }
  };

  console.log("🔍 Starting connection tests...");

  // Test 1: WebRTC Support
  try {
    console.log("Testing WebRTC support...");
    const webrtcSupport = testWebRTCSupport();
    results.tests.webrtc.status = webrtcSupport.supported ? "passed" : "failed";
    results.tests.webrtc.details = webrtcSupport;
  } catch (error) {
    results.tests.webrtc.status = "failed";
    results.tests.webrtc.error = error.message;
  }

  // Test 2: Socket Connection
  try {
    console.log("Testing Socket.io connection...");
    const socketTest = await testSocketConnection();
    results.tests.socket.status = socketTest.connected ? "passed" : "failed";
    results.tests.socket.details = socketTest;
  } catch (error) {
    results.tests.socket.status = "failed";
    results.tests.socket.error = error.message;
  }

  // Test 3: Media Access
  try {
    console.log("Testing media device access...");
    const mediaTest = await testMediaAccess();
    results.tests.media.status = mediaTest.success ? "passed" : "failed";
    results.tests.media.details = mediaTest;
  } catch (error) {
    results.tests.media.status = "failed";
    results.tests.media.error = error.message;
  }

  // Test 4: Network Connectivity
  try {
    console.log("Testing network connectivity...");
    const networkTest = await testNetworkConnectivity();
    results.tests.network.status = networkTest.success ? "passed" : "failed";
    results.tests.network.details = networkTest;
  } catch (error) {
    results.tests.network.status = "failed";
    results.tests.network.error = error.message;
  }

  // Overall result
  const passedTests = Object.values(results.tests).filter(test => test.status === "passed").length;
  const totalTests = Object.keys(results.tests).length;
  
  if (passedTests === totalTests) {
    results.overall = "passed";
  } else if (passedTests >= totalTests - 1) {
    results.overall = "warning";
  } else {
    results.overall = "failed";
  }

  console.log(`✅ Connection tests completed: ${passedTests}/${totalTests} passed`);
  return results;
};

// Test WebRTC browser support
const testWebRTCSupport = () => {
  const support = {
    RTCPeerConnection: !!(window.RTCPeerConnection || window.mozRTCPeerConnection || window.webkitRTCPeerConnection),
    getUserMedia: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
    mediaDevices: !!navigator.mediaDevices,
    supported: false
  };

  support.supported = support.RTCPeerConnection && support.getUserMedia && support.mediaDevices;

  return {
    supported: support.supported,
    details: support,
    browser: navigator.userAgent.split(' ').pop(),
  };
};

// Test Socket.io connection
const testSocketConnection = () => {
  return new Promise((resolve) => {
    const testSocket = socketService.socket;
    
    if (testSocket && testSocket.connected) {
      resolve({
        connected: true,
        socketId: testSocket.id,
        transport: testSocket.io.engine.transport.name,
        latency: 0 // Could implement ping test
      });
    } else {
      resolve({
        connected: false,
        error: "Socket not connected"
      });
    }
  });
};

// Test media device access
const testMediaAccess = async () => {
  try {
    // Test video + audio
    let stream = await navigator.mediaDevices.getUserMedia({ 
      video: true, 
      audio: true 
    });

    const devices = {
      video: stream.getVideoTracks().length,
      audio: stream.getAudioTracks().length,
      total: stream.getTracks().length
    };

    // Clean up stream
    stream.getTracks().forEach(track => track.stop());

    return {
      success: true,
      devices,
      constraints: { video: true, audio: true }
    };

  } catch (error) {
    // Try audio only fallback
    try {
      let stream = await navigator.mediaDevices.getUserMedia({ 
        video: false, 
        audio: true 
      });
      
      const devices = {
        video: 0,
        audio: stream.getAudioTracks().length,
        total: stream.getTracks().length
      };

      stream.getTracks().forEach(track => track.stop());

      return {
        success: true,
        devices,
        constraints: { video: false, audio: true },
        warning: "Video access denied, audio only"
      };

    } catch (audioError) {
      return {
        success: false,
        error: `Media access failed: ${error.message}`,
        fallbackError: audioError.message
      };
    }
  }
};

// Test network connectivity for WebRTC
const testNetworkConnectivity = () => {
  return new Promise((resolve) => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
      ]
    });

    let timeout = setTimeout(() => {
      pc.close();
      resolve({
        success: false,
        error: "ICE gathering timeout (10s)",
        timeout: true
      });
    }, 10000);

    const candidates = [];

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        candidates.push({
          type: event.candidate.type,
          protocol: event.candidate.protocol,
          address: event.candidate.address
        });
      } else {
        // ICE gathering complete
        clearTimeout(timeout);
        pc.close();
        resolve({
          success: true,
          candidates: candidates.length,
          types: [...new Set(candidates.map(c => c.type))]
        });
      }
    };

    // Create data channel to trigger ICE gathering
    pc.createDataChannel("test");
    pc.createOffer()
      .then(offer => pc.setLocalDescription(offer))
      .catch(error => {
        clearTimeout(timeout);
        pc.close();
        resolve({
          success: false,
          error: error.message
        });
      });
  });
};

// Quick connection health check
export const quickHealthCheck = async () => {
  const health = {
    socket: socketService.isConnected(),
    webrtc: !!(window.RTCPeerConnection && navigator.mediaDevices),
    timestamp: new Date()
  };

  if (health.socket && health.webrtc) {
    health.status = "healthy";
  } else if (health.socket || health.webrtc) {
    health.status = "degraded";
  } else {
    health.status = "unhealthy";
  }

  return health;
};

// Format test results for display
export const formatTestResults = (results) => {
  const lines = [
    `🔍 Connection Test Results (${results.timestamp.toLocaleTimeString()})`,
    `Overall: ${getStatusEmoji(results.overall)} ${results.overall.toUpperCase()}`,
    "",
    "Details:"
  ];

  Object.entries(results.tests).forEach(([testName, testResult]) => {
    lines.push(`  ${getStatusEmoji(testResult.status)} ${testName.toUpperCase()}: ${testResult.status}`);
    
    if (testResult.error) {
      lines.push(`    ❌ Error: ${testResult.error}`);
    }
    
    if (testResult.details) {
      if (testName === "webrtc" && testResult.details.details) {
        const details = testResult.details.details;
        lines.push(`    📋 RTCPeerConnection: ${details.RTCPeerConnection ? '✅' : '❌'}`);
        lines.push(`    📋 getUserMedia: ${details.getUserMedia ? '✅' : '❌'}`);
      }
      
      if (testName === "media" && testResult.details.devices) {
        const devices = testResult.details.devices;
        lines.push(`    📋 Video tracks: ${devices.video}`);
        lines.push(`    📋 Audio tracks: ${devices.audio}`);
      }
      
      if (testName === "network" && testResult.details.candidates) {
        lines.push(`    📋 ICE candidates: ${testResult.details.candidates}`);
        lines.push(`    📋 Types: ${testResult.details.types?.join(', ')}`);
      }
    }
    
    lines.push("");
  });

  return lines.join("\n");
};

const getStatusEmoji = (status) => {
  switch (status) {
    case "passed": return "✅";
    case "failed": return "❌";
    case "warning": return "⚠️";
    case "pending": return "⏳";
    default: return "❓";
  }
};