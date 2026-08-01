import React, { useEffect, useState } from "react";
import { Text } from "ink";

const TypingIndicator = ({ users }) => {
  const [dots, setDots] = useState(1);

  useEffect(() => {
    if (users.length === 0) {
      return;
    }
    const timer = setInterval(() => setDots((d) => (d % 3) + 1), 400);
    return () => clearInterval(timer);
  }, [users.length]);

  if (users.length === 0) {
    return <Text> </Text>;
  }
  const names = users.join(", ");
  const label = users.length === 1 ? "is" : "are";
  return (
    <Text dimColor>
      <Text color="yellow">{names}</Text> {label} typing{".".repeat(dots)}
    </Text>
  );
};

export default TypingIndicator;
