import React, { useState, useRef, useEffect, useContext } from "react";
import { useParams } from "react-router-dom";
import { RoomContext } from "../../utils/RoomContext";
import Peer from "simple-peer";
import RecordRTC from "recordrtc";
import "./videoStream.css";
import { useSelector } from "react-redux";
import { decryptData, encryptData } from "../../utils/toEncrypt";
import { CiVideoOn } from "react-icons/ci";
import { CiVideoOff } from "react-icons/ci";
import { MdCallEnd } from "react-icons/md";
import { MdAddCall } from "react-icons/md";
import { CgRecord } from "react-icons/cg";
import { CiSaveDown1 } from "react-icons/ci";
import { MdOutlinePermIdentity } from "react-icons/md";


const StreamRoom = () => {
  const { id } = useParams();
  const { socket } = useContext(RoomContext);
  const { username, email } = useSelector(
    (state) => state.currentuserreducer
  )?.result || {};
  // console.log(username, email);

  const [stream, setStream] = useState(null);
  const [receivingCall, setReceivingCall] = useState(false);
  const [caller, setCaller] = useState("");
  const [callerSignal, setCallerSignal] = useState("");
  const [callAccepted, setCallAccepted] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recorder, setRecorder] = useState(null);
  const [recordedBlobs, setRecordedBlobs] = useState([]);
  const [screenStream, setScreenStream] = useState(null);
  const [me, setMe] = useState("");
  const [callId, setCallId] = useState("");
  const userVideo = useRef();
  const partnerVideo = useRef();
  const connectionRef = useRef();

  // useEffect(() => {
  //   socket.emit("join-room", { roomId: email }); ///////// {roomId: id} ////////////
  //   setMe(email);
  //   socket.on("receiveCall", ({ from, name: callerName, signal }) => {
  //     // console.log(from, callerName, signal);
  //     setReceivingCall(true);
  //     setCaller(from);
  //     setCallerSignal(signal);
  //   });
  // }, [id]);

  useEffect(() => {
    const savedUser = localStorage.getItem("user");
    if (savedUser) {
      const decryptedUser = decryptData(savedUser); 
      setMe(decryptedUser.email);
    } else {
      setMe(email);
    }
    socket.emit("join-room", { roomId: email });
    socket.on("receiveCall", ({ from, name: callerName, signal }) => {
      setReceivingCall(true);
      setCaller(from);
      setCallerSignal(signal);
    });
  }, [id, email, socket]);

  useEffect(() => {
    if (username && email) {
      const encryptedUser = encryptData({ username, email }); 
      localStorage.setItem("user", encryptedUser);
    }
  }, [username, email]);

  const startVideo = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      setStream(stream);
      if (userVideo.current) {
        userVideo.current.srcObject = stream;
      }
    } catch (error) {
      console.error("Error accessing media devices.", error);
    }
  };

  const callUser = (id) => {
    const peer = new Peer({
      initiator: true,
      trickle: false,
      stream: stream,
    });

    peer.on("signal", (data) => {
      socket.emit("callUser", {
        userToCall: id,
        signalData: data,
        from: me,
        name: username,
      });
    });

    peer.on("stream", (currentStream) => {
      if (partnerVideo.current) {
        partnerVideo.current.srcObject = currentStream;
      }
    });

    socket.on("callAccepted", (signal) => {
      // console.log(signal);
      setCallAccepted(true);
      peer.signal(signal);
    });

    connectionRef.current = peer;
    setCallId(id);
  };

  const acceptCall = () => {
    setCallAccepted(true);

    const peer = new Peer({
      initiator: false,
      trickle: false,
      stream: stream,
    });

    peer.on("signal", (data) => {
      socket.emit("answerCall", { signal: data, to: caller }); /////////// may be mistake, check again ///////////
    });

    peer.on("stream", (currentStream) => {
      if (partnerVideo.current) {
        partnerVideo.current.srcObject = currentStream;
      }
    });

    peer.signal(callerSignal);
    connectionRef.current = peer;
  };

  const startScreenShare = async () => {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
      });
      setScreenStream(screenStream);
      connectionRef.current.replaceTrack(
        stream.getVideoTracks()[0],
        screenStream.getVideoTracks()[0],
        stream
      );
      if (userVideo.current) {
        userVideo.current.srcObject = screenStream;
      }
    } catch (error) {
      console.error("Error sharing screen.", error);
    }
  };

  const startRecording = () => {
    const options = {
      mimeType: "video/webm;codecs=vp9",
    };
    const recorder = new RecordRTC(stream, options);
    recorder.startRecording();
    setRecorder(recorder);
    setRecording(true);
  };

  const stopRecording = () => {
    recorder.stopRecording(() => {
      const blobs = recorder.getBlob();
      setRecordedBlobs([...recordedBlobs, blobs]);
      setRecording(false);
    });
  };

  const saveRecording = () => {
    recordedBlobs.forEach((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = url;
      a.download = "video_call_recording.webm";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
    });
  };

  const disconnectCall = () => {
    if (connectionRef.current) {
      connectionRef.current.destroy();
    }

    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }

    if (screenStream) {
      screenStream.getTracks().forEach((track) => track.stop());
    }

    // Reset call state
    setCallAccepted(false);
    setReceivingCall(false);
    setCaller("");
    setCallerSignal("");
    setStream(null);
    setScreenStream(null);

    if (userVideo.current) {
      userVideo.current.srcObject = null;
    }
    if (partnerVideo.current) {
      partnerVideo.current.srcObject = null;
    }
    setCallId('');
  };

  return (
    <div className="video_stream_container">
      <h1>Video Call</h1>
      <div className="button_container">
        <button className="start_meeting_btn" onClick={startVideo}>Start Video</button>
        <button className="start_meeting_btn"  onClick={disconnectCall}>Disconnect Call</button>
        <button className="start_meeting_btn"  onClick={() => callUser("armanalam78578@gmail.com")}>
          Call Friend
        </button>
        
        <button className="start_meeting_btn"  onClick={startScreenShare}>Share Screen</button>
        {recording ? (
          <button className="start_meeting_btn"  onClick={stopRecording}>Stop Recording</button>
        ) : (
          <button className="start_meeting_btn"  onClick={startRecording}>Start Recording</button>
        )}
        <button className="start_meeting_btn"  onClick={saveRecording}>Save Recording</button>
      </div>
      <div>
      {receivingCall && !callAccepted && (
          <div>
            <h1>{caller} is calling...</h1>
            <button className="start_meeting_btn"  onClick={acceptCall}>Accept Call</button>
          </div>
        )}
      </div>
      <div className="video_container">
        <video playsInline muted ref={userVideo} autoPlay />
        <video playsInline ref={partnerVideo} autoPlay />
      </div>
      <div>Current Call ID: {callId}</div>
    </div>
  );
};

export default StreamRoom;
