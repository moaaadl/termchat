import React from "react";
import { Text } from "ink";

const TypingIndicator = ({ users }) => {
  if (users.length === 0) {
    return <Text> </Text>;
  }
  const names = users.join(", ");
  const label = users.length === 1 ? "is" : "are";
  return <Text dimColor>{`${names} ${label} typing...`}</Text>;
};

export default TypingIndicator;
