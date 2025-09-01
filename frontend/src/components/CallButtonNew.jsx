import { Video } from "lucide-react";

const CallButton = ({ handleVideoCall }) => {
  return (
    <div className="absolute top-2 right-4 z-10">
      <button
        onClick={handleVideoCall}
        className="bg-green-500 text-white p-2 rounded-full hover:bg-green-600 transition-colors duration-200 shadow-lg"
        title="Start Video Call"
      >
        <Video size={20} />
      </button>
    </div>
  );
};

export default CallButton;