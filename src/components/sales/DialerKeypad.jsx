import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Delete } from "lucide-react";
import { Input } from "@/components/ui/input";

export default function DialerKeypad({ onNumberPad }) {
  const [number, setNumber] = useState("");

  const handleKeyPress = (key) => {
    if (key === "backspace") {
      setNumber(number.slice(0, -1));
    } else if (key === "*" || key === "#") {
      setNumber(number + key);
    } else {
      setNumber(number + key);
    }
    onNumberPad(number + (key !== "backspace" ? key : ""));
  };

  const handleClear = () => {
    setNumber("");
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
    <div className="space-y-4 bg-white p-4 rounded-lg">
      <Input
        type="tel"
        placeholder="+1 (555) 000-0000"
        value={number}
        readOnly
        className="text-center text-2xl font-bold tracking-wider h-12"
      />

      <div className="grid grid-cols-3 gap-3">
        {keypad.map((row, rowIdx) =>
          row.map((key) => (
            <Button
              key={`${rowIdx}-${key.label}`}
              onClick={() => handleKeyPress(key.label)}
              className="h-16 text-xl font-semibold hover:bg-gray-100"
              variant="outline"
            >
              <div className="flex flex-col items-center">
                <span>{key.label}</span>
                {key.letters && <span className="text-xs text-gray-500">{key.letters}</span>}
              </div>
            </Button>
          ))
        )}
      </div>

      <Button
        onClick={handleClear}
        variant="outline"
        className="w-full h-12 text-lg"
      >
        <Delete className="w-5 h-5 mr-2" />
        Clear
      </Button>
    </div>
  );
}