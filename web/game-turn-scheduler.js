export function createAiTurnScheduler({
  emitChange,
  setAiThinking,
  captureEpoch,
  isCurrentEpoch,
  delayMs = 250
}) {
  let pendingComputerTurn = false;

  function schedule(action, side) {
    if (pendingComputerTurn) return false;

    pendingComputerTurn = true;
    setAiThinking(true, side);
    emitChange();

    const epoch = captureEpoch();
    setTimeout(() => {
      pendingComputerTurn = false;
      setAiThinking(false);
      if (!isCurrentEpoch(epoch)) return;
      action();
      if (!isCurrentEpoch(epoch)) return;
      emitChange();
    }, delayMs);

    return true;
  }

  function reset() {
    pendingComputerTurn = false;
  }

  function isPending() {
    return pendingComputerTurn;
  }

  return {
    schedule,
    reset,
    isPending
  };
}
