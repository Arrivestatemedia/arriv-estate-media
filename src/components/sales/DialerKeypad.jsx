import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { DeleteIcon } from "lucide-react";

export default function DialerKeypad({ onDial }) {
  const [number, setNumber] = useState("");

  const handleKeyPress = (key) => {
    if (key === "backspace") {
      setNumber(number.slice(0, -1));
    } else {
      setNumber(number + key);
    }
  };

  const handleClear = () => {
    setNumber("");
  };

  const handleCall = () => {
    if (number.trim()) {
      onDial(number);
      setNumber("");
    }
  };

  const keypad = [
    [
      { label: "1", letters: "" },
      { label: "2", letters: "ABC" },
      { label: "3", letters: "DEF" },
    ],
    [
      { label: "4", letters: "GHI" },
      { label: "5", letters: "JKL" },
      { label: "6", letters: "MNO" },
    ],
    [
      { label: "7", letters: "PQRS" },
      { label: "8", letters: "TUV" },
      { label: "9", letters: "WXYZ" },
    ],
    [
      { label: "*", letters: "" },
      { label: "0", letters: "+" },
      { label: "#", letters: "" },
    ],
  ];

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
      {/* Display */}
      <div className="bg-gray-50 rounded-lg p-4 text-center">
        <input
          type="text"
          value={number}
          readOnly
          placeholder="Enter number"
          className="w-full text-center text-3xl font-mono font-bold bg-transparent border-none outline-none"
        />
      </div>

      {/* Keypad Grid */}
      <div className="grid grid-cols-3 gap-2">
        {keypad.map((row, rowIdx) =>
          row.map((key) => (
            <Button
              key={`${rowIdx}-${key.label}`}
              onClick={() => handleKeyPress(key.label)}
              className="h-14 text-lg font-semibold"
              variant="outline"
            >
              <div className="flex flex-col items-center">
                <span>{key.label}</span>
                {key.letters && <span className="text-xs text-gray-400">{key.letters}</span>}
              </div>
            </Button>
          ))
        )}
      </div>

      {/* Controls */}
      <div className="grid grid-cols-2 gap-2">
        <Button
          onClick={handleClear}
          variant="outline"
          className="h-12"
        >
          Clear
        </Button>
        <Button
          onClick={handleCall}
          className="h-12 bg-green-600 hover:bg-green-700 text-white font-semibold"
        >
          Call
        </Button>
      </div>
    </div>
  );
}