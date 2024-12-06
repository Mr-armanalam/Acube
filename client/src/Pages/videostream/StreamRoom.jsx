import React, { useState, useRef, useEffect, useContext } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Peer from "simple-peer";
import RecordRTC from "recordrtc";
import "./videoStream.css";
import { useSelector } from "react-redux";
import { decryptData2, encryptData2 } from "../../utils/toEncrypt";
import { CiVideoOn } from "react-icons/ci";
import { MdCallEnd } from "react-icons/md";
import { MdAddCall } from "react-icons/md";
import { CgRecord } from "react-icons/cg";
import { CiSaveDown1 } from "react-icons/ci";
import { MdOutlineScreenShare } from "react-icons/md";
import { FaRegCircleStop } from "react-icons/fa6";
import { FiPhoneCall } from "react-icons/fi";
import { RoomContext } from "../../context/RoomContext";

const StreamRoom = () => {
  const navigate = useNavigate();
  const { encryptId } = useParams();
  // console.log(decryptData(id));
  const id = decryptData2(encryptId);

  const { socket } = useContext(RoomContext);
  const { username, email, picture } =
    useSelector((state) => state.currentuserreducer)?.result || {};

  const [isUserVideoShown, setIsUserVideoShown] = useState(true);
  const [isOnstream, setIsOnstream] = useState(false);
  const [stream, setStream] = useState(null);
  const [receivingCall, setReceivingCall] = useState(false);
  const [caller, setCaller] = useState("");
  const [callerSignal, setCallerSignal] = useState("");
  const [callAccepted, setCallAccepted] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recorder, setRecorder] = useState(null);
  const [recordedBlobs, setRecordedBlobs] = useState([]);
  const [screenStream, setScreenStream] = useState(null);
  const [currentStream1, setCurrentStream1] = useState(null);
  const [me, setMe] = useState("");
  const [callId, setCallId] = useState("");
  const userVideo = useRef(null);
  const partnerVideo = useRef(null);
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
      const decryptedUser = decryptData2(savedUser);
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
      const encryptedUser = encryptData2({ username, email });
      localStorage.setItem("user", encryptedUser);
    }
  }, [username, email]);

  const startVideo = async () => {
    try {
      setIsOnstream(true);
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
    setIsOnstream(true);
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
        setCurrentStream1(currentStream);
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
    try {
      //  if (connectionRef.current) {
      //    connectionRef.current.destroy();
      //  }

      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }

      if (screenStream) {
        screenStream.getTracks().forEach((track) => track.stop());
      }

      // Reset call state
      setIsOnstream(false);
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
      setCallId("");
    } catch (error) {
      console.log(error);
    }
  };

  const handleFullScreen = () => {
    if (userVideo.current && partnerVideo.current) {
      if (isUserVideoShown) {
        partnerVideo.current.srcObject = stream;
        userVideo.current.srcObject = currentStream1;
      } else {
        userVideo.current.srcObject = stream;
        partnerVideo.current.srcObject = currentStream1;
      }
      setIsUserVideoShown(!isUserVideoShown);
    } else {
      console.error("error in videoSrc changing");
    }
  };

  useEffect(() => {
    if (!localStorage.getItem("Profile")) {
      navigate("/");
    }
  }, [navigate, username]);

  return (
    <div className="video_stream_container">
      <div className="video_container">
        <div className="callerIds">
          <div>Your ID: {me} </div>
          <div>
            Caller ID: {callId} {caller}
          </div>
        </div>

        {callId && !callAccepted && (
          <div className="callStatus">Calling... {caller}</div>
        )}

        {stream === null && (
          <div className="FriendsLogo">
            {me?.toUpperCase().charAt(0)}
          </div>
        )}

        <div className="video_box">
          <video
            playsInline
            className="friendsVideo"
            ref={partnerVideo}
            autoPlay
          />
          {isOnstream && (
            <video
              onClick={handleFullScreen}
              playsInline
              className="selfVideo"
              muted
              ref={userVideo}
              autoPlay
            />
          )}
        </div>
      </div>

      <div className="button_container">
        <button className="start_meeting_btn" onClick={startVideo}>
          <CiVideoOn />
        </button>

        <button
          disabled={!stream && true}
          className="start_meeting_btn"
          style={{ color: ` ${!stream ? "gray" : "red"} ` }}
          onClick={disconnectCall}
        >
          <MdCallEnd />
        </button>

        {receivingCall && !callAccepted ? (
          <button
            className="start_meeting_btn"
            style={{ color: "green" }}
            onClick={acceptCall}
          >
            <FiPhoneCall />
          </button>
        ) : (
          <button
            disabled={!stream && true}
            className="start_meeting_btn"
            onClick={() => callUser(id)}
          >
            <MdAddCall
              style={{
                color: ` ${!stream ? "gray" : "var(--forground_text)"}`,
              }}
            />
          </button>
        )}

        <button
          disabled={!stream && true}
          className="start_meeting_btn"
          onClick={startScreenShare}
        >
          <MdOutlineScreenShare
            style={{ color: ` ${!stream ? "gray" : "var(--forground_text)"}` }}
          />
        </button>

        {recording ? (
          <button
            disabled={!stream && true}
            className="start_meeting_btn"
            onClick={stopRecording}
          >
            <FaRegCircleStop
              style={{ color: ` ${!stream ? "gray" : "d6a146"}` }}
            />
          </button>
        ) : (
          <button
            disabled={!stream && true}
            className="start_meeting_btn"
            onClick={startRecording}
          >
            <CgRecord
              style={{
                color: ` ${!stream ? "gray" : "var(--forground_text)"}`,
              }}
            />
          </button>
        )}

        <button
          className="start_meeting_btn"
          disabled={!stream && true}
          onClick={saveRecording}
        >
          <CiSaveDown1
            style={{ color: ` ${!stream ? "gray" : "var(--forground_text)"}` }}
          />
        </button>
      </div>
    </div>
  );
};

export default StreamRoom;
