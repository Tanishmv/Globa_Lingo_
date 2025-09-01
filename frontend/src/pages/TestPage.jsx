import { useState, useEffect } from "react";
import { testConnections, quickHealthCheck, formatTestResults } from "../lib/connectionTest";
import socketService from "../lib/socket";
import useAuthUser from "../hooks/useAuthUser";
import toast from "react-hot-toast";

const TestPage = () => {
  const { authUser } = useAuthUser();
  const [testResults, setTestResults] = useState(null);
  const [isRunningTests, setIsRunningTests] = useState(false);
  const [healthStatus, setHealthStatus] = useState(null);
  const [socketLogs, setSocketLogs] = useState([]);

  // Quick health check on mount
  useEffect(() => {
    const runQuickCheck = async () => {
      const health = await quickHealthCheck();
      setHealthStatus(health);
    };
    
    runQuickCheck();
    
    // Update health status every 5 seconds
    const interval = setInterval(runQuickCheck, 5000);
    return () => clearInterval(interval);
  }, []);

  // Socket logging
  useEffect(() => {
    if (authUser) {
      const addLog = (message, type = "info") => {
        const logEntry = {
          id: Date.now() + Math.random(),
          timestamp: new Date(),
          message,
          type
        };
        setSocketLogs(prev => [logEntry, ...prev.slice(0, 19)]); // Keep last 20 logs
      };

      // Initialize socket with logging
      const initSocket = async () => {
        try {
          addLog("Connecting to Socket.io server...", "info");
          await socketService.connect(authUser);
          addLog("✅ Connected to Socket.io server", "success");
        } catch (error) {
          addLog(`❌ Socket connection failed: ${error.message}`, "error");
        }
      };

      initSocket();

      // Add event listeners for logging
      socketService.on("connect", () => addLog("🔌 Socket connected", "success"));
      socketService.on("disconnect", (reason) => addLog(`🔌 Socket disconnected: ${reason}`, "warning"));
      socketService.on("error", (error) => addLog(`❌ Socket error: ${error.message}`, "error"));
      socketService.on("user:online", (data) => addLog(`👤 User online: ${data.userId}`, "info"));
      socketService.on("user:offline", (data) => addLog(`👤 User offline: ${data.userId}`, "info"));

      return () => {
        socketService.off("connect");
        socketService.off("disconnect");
        socketService.off("error");
        socketService.off("user:online");
        socketService.off("user:offline");
      };
    }
  }, [authUser]);

  const runFullTests = async () => {
    setIsRunningTests(true);
    setTestResults(null);
    
    try {
      toast.loading("Running connection tests...", { id: "test-toast" });
      const results = await testConnections();
      setTestResults(results);
      
      if (results.overall === "passed") {
        toast.success("All tests passed! 🎉", { id: "test-toast" });
      } else if (results.overall === "warning") {
        toast.success("Most tests passed ⚠️", { id: "test-toast" });
      } else {
        toast.error("Some tests failed ❌", { id: "test-toast" });
      }
      
    } catch (error) {
      toast.error(`Test failed: ${error.message}`, { id: "test-toast" });
    } finally {
      setIsRunningTests(false);
    }
  };

  const sendTestMessage = () => {
    if (socketService.isConnected()) {
      socketService.emit("test:message", {
        message: "Hello from test page!",
        timestamp: new Date()
      });
      toast.success("Test message sent");
    } else {
      toast.error("Socket not connected");
    }
  };

  const clearLogs = () => {
    setSocketLogs([]);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Connection Test Dashboard</h1>
          <p className="text-gray-600">Test WebRTC and Socket.io connections for debugging</p>
        </div>

        {/* Health Status */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <h3 className="text-lg font-semibold mb-4">Quick Health Check</h3>
            {healthStatus ? (
              <div className="space-y-2">
                <div className={`inline-flex px-3 py-1 rounded-full text-sm font-medium ${
                  healthStatus.status === "healthy" ? "bg-green-100 text-green-800" :
                  healthStatus.status === "degraded" ? "bg-yellow-100 text-yellow-800" :
                  "bg-red-100 text-red-800"
                }`}>
                  {healthStatus.status === "healthy" && "🟢"}
                  {healthStatus.status === "degraded" && "🟡"}
                  {healthStatus.status === "unhealthy" && "🔴"}
                  {" "}{healthStatus.status.toUpperCase()}
                </div>
                <div className="text-sm text-gray-600 space-y-1">
                  <div>Socket: {healthStatus.socket ? "✅ Connected" : "❌ Disconnected"}</div>
                  <div>WebRTC: {healthStatus.webrtc ? "✅ Supported" : "❌ Not supported"}</div>
                  <div className="text-xs">Last check: {healthStatus.timestamp.toLocaleTimeString()}</div>
                </div>
              </div>
            ) : (
              <div className="text-gray-500">Loading...</div>
            )}
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <h3 className="text-lg font-semibold mb-4">Actions</h3>
            <div className="space-y-3">
              <button
                onClick={runFullTests}
                disabled={isRunningTests}
                className={`w-full px-4 py-2 rounded-lg font-medium ${
                  isRunningTests 
                    ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                    : "bg-blue-500 text-white hover:bg-blue-600"
                }`}
              >
                {isRunningTests ? "Running Tests..." : "Run Full Tests"}
              </button>
              
              <button
                onClick={sendTestMessage}
                className="w-full px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 font-medium"
              >
                Send Test Message
              </button>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <h3 className="text-lg font-semibold mb-4">Socket Status</h3>
            <div className="text-sm space-y-2">
              <div>Status: {socketService.getConnectionStatus()}</div>
              <div>Connected: {socketService.isConnected() ? "✅ Yes" : "❌ No"}</div>
              <div>Socket ID: {socketService.socket?.id || "N/A"}</div>
              <div>Transport: {socketService.socket?.io?.engine?.transport?.name || "N/A"}</div>
            </div>
          </div>
        </div>

        {/* Test Results */}
        {testResults && (
          <div className="bg-white p-6 rounded-lg shadow-sm border mb-8">
            <h3 className="text-lg font-semibold mb-4">Test Results</h3>
            <pre className="text-sm bg-gray-100 p-4 rounded-lg overflow-auto whitespace-pre-wrap">
              {formatTestResults(testResults)}
            </pre>
          </div>
        )}

        {/* Socket Logs */}
        <div className="bg-white rounded-lg shadow-sm border">
          <div className="p-6 border-b border-gray-200 flex justify-between items-center">
            <h3 className="text-lg font-semibold">Socket Event Logs</h3>
            <button
              onClick={clearLogs}
              className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded"
            >
              Clear Logs
            </button>
          </div>
          
          <div className="p-6">
            {socketLogs.length === 0 ? (
              <p className="text-gray-500 text-center">No logs yet</p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {socketLogs.map((log) => (
                  <div
                    key={log.id}
                    className={`text-sm p-2 rounded flex items-start gap-3 ${
                      log.type === "success" ? "bg-green-50 text-green-800" :
                      log.type === "error" ? "bg-red-50 text-red-800" :
                      log.type === "warning" ? "bg-yellow-50 text-yellow-800" :
                      "bg-gray-50 text-gray-800"
                    }`}
                  >
                    <span className="text-xs text-gray-500 min-w-0 flex-shrink-0">
                      {log.timestamp.toLocaleTimeString()}
                    </span>
                    <span className="flex-1 min-w-0">{log.message}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TestPage;