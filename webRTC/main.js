import './style.css'
import javascriptLogo from './javascript.svg'
import { setupCounter } from './counter.js'
import firebase from 'firebase/app'
import 'firebase/firestore'

const firebaseConfig = {
  apiKey: "AIzaSyBzkbg14C_nTx8lYAvfwacdlHtFyN0fxpQ",
  authDomain: "webrtc-e5fe7.firebaseapp.com",
  projectId: "webrtc-e5fe7",
  storageBucket: "webrtc-e5fe7.appspot.com",
  messagingSenderId: "575952821438",
  appId: "1:575952821438:web:66c7299ce41549c6add2ef",
  measurementId: "G-K9LTZR04H4"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const firestore = firebase.firestore();

const servers = {
  iceServers: [
    {
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302']
    }
  ]
}

let pc = new RTCPeerConnection(servers);
let localStream = null;
let remoteStream = null;


const webcamButton = document.getElementById('webcamButton');
const webcamVideo = document.getElementById('webcamVideo');
const callButton = document.getElementById('callButton');
const callInput = document.getElementById('callInput');
const answerButton = document.getElementById('answerButton');
const remoteVideo = document.getElementById('remoteVideo');
const hangupButton = document.getElementById('hangupButton');


// 1. Setup media sources

webcamButton.onclick = async () => {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  remoteStream = new MediaStream();

  //Push thacks from local stream to peer connection
  localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
  
  //Pull tracks from remote stream, add to video stream
  pc.ontrack = event => {
    event.streams[0].getTracks().forEach(track => {
      remoteStream.addTrack(track);
    })
  };

  webcamVideo.srcObject = localStream
  remoteVideo.srcObject = remoteStream
}

// 2. Create an offer

callButton.onclick = async () => {
  const callDoc = firestore.collection('calls').doc();
  const offerCandidates = callDoc.collection('offerCandidates');
  const answerCandidates = callDoc.collection('answerCandidates');

  callInput.value = callDoc.id;

  pc.onicecandidate = event => {
    event.candidate && offerCandidates.add(event.candidate.toJSON())
  }

  // Create offer
  const offerDescription = await pc.createOffer();
  await pc.setLocalDescription(offerDescription);

  const offer = {
    sdp: offerDescription.sdp,
    type: offerDescription.type
  }

  await callDoc.ser({ offer })

  // Listen for remote answer
  callDoc.onSnapshot((snapshot) => {
    const data = snapshot.data();
    if (!pc.currentRemoteDescription && data?.answer) {
      const answerDescription = new RTCSessionDescription(data.answer);
      pc.setRemoteDescription(answerDescription);
    }
  })

  // When answered, add candidate to peer connection
  answerCandidates.onSnapshot(snapshot => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        const candidate = new RTCIceCandidate(change.doc.data());
        pc.addIceCandidate(candidate);
      }
    })
  })
}

// 3. Answer the call with the unique ID
answerButton.onclick = async () => {
  const callId = callInput.value;
  const callDoc = firestore.collection('calls').doc(callId);
  const answerCandidates = callDoc.collection('answerCandidates');

  pc.onicecandidate = event => {
    event.candidate && answerCandidates.add(event.candidate.toJSON())
  }

  const callData = (await callDoc.get()).data();

  const offerDescription = callData.offer
  await pc.setRemoteDescription(new RTCSessionDescription(offerDescription))

  const answerDescription = await pc.createAnswer();
  await pc.setLocalDescription(answerDescription);

  const answer = {
    type: answerDescription.type,
    sdp: answerDescription.sdp,
  }

  await callDoc.update({ answer });

  offerCandidates.onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      console.log(change)
      if (change.type === 'added') {
        let data = change.doc.data();
        pc.addIceCandidate(new RTCIceCandidate(data))
      }
    })
  })
}
