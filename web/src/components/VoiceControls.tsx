import React, { useEffect, useRef, useState } from "react";

type Props = {
  onResult: (text: string) => void;
};

export default function VoiceControls({ onResult }: Props) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.onresult = (event: any) => {
      const utter = event.results[0][0].transcript;
      onResult(utter);
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
  }, []);

  const start = () => {
    if (!recognitionRef.current) {
      alert("SpeechRecognition is not supported in this browser.");
      return;
    }
    setListening(true);
    recognitionRef.current.start();
  };
  const stop = () => {
    recognitionRef.current?.stop();
    setListening(false);
  };

  return (
    <div className="voice-controls">
      <button className={`btn btn--subtle ${listening ? "btn--listening" : ""}`} onClick={listening ? stop : start} disabled={!supported}>
        {listening ? "Stop Recording" : "Start Recording"}
      </button>
    </div>
  );
}
