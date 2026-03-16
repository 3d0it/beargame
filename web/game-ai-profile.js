export const DIFFICULTY_CONFIG = {
  easy: {
    bearDepth: 1,
    hunterDepth: 1,
    setupDepth: 1,
    quiescenceDepth: 0,
    rolloutDepth: 0,
    rolloutWeight: 0,
    targetRating: 3
  },
  medium: {
    bearDepth: 3,
    hunterDepth: 2,
    setupDepth: 1,
    quiescenceDepth: 0,
    rolloutDepth: 0,
    rolloutWeight: 0,
    targetRating: 5
  },
  hard: {
    bearDepth: 8,
    hunterDepth: 5,
    setupDepth: 5,
    quiescenceDepth: 2,
    rolloutDepth: 5,
    rolloutWeight: 0.6,
    targetRating: 8
  }
};

export const POSITION_PROFILE = {
  centerNode: 18,
  innerRingNodes: [16, 17, 19, 20],
  outerGateways: [2, 5, 8, 11]
};

export const AI_HEURISTIC_PROFILE = {
  terminal: {
    trappedBase: -250000,
    trappedMoveBonus: 140,
    escapedBase: 250000,
    escapedMovePenalty: 80
  },
  mobilityDanger: {
    oneMove: 180,
    twoMoves: 80
  },
  evaluation: {
    bear: {
      mobility: 52,
      twoStepMobility: 16,
      reachable3: 10,
      safeAdjacents: 14,
      safeRoutes: 42,
      frontierReach: 5,
      distanceSum: 0.7,
      pressure: -140,
      trapReplies: -90,
      squeezeReplies: -26,
      trapRoutes: -120,
      squeezeRoutes: -55,
      bearAtCenter: -110,
      reachableOuterGateways: -22,
      directBlockers: -72,
      innerRingControl: -38,
      outerEscapes: 22,
      mobilityDanger: -1,
      centerDistance: -0.5,
      hunterAdjacency: -32
    },
    hunters: {
      mobility: -52,
      twoStepMobility: -16,
      reachable3: -10,
      safeAdjacents: -14,
      safeRoutes: -42,
      frontierReach: -5,
      distanceSum: -0.7,
      pressure: 140,
      trapReplies: 90,
      squeezeReplies: 26,
      trapRoutes: 120,
      squeezeRoutes: 55,
      bearAtCenter: 110,
      reachableOuterGateways: 22,
      directBlockers: 72,
      innerRingControl: 38,
      outerEscapes: -22,
      mobilityDanger: 1,
      centerDistance: 0.5,
      hunterAdjacency: 32
    }
  },
  tactical: {
    bear: {
      safeRoutes: 420,
      frontierReach: 22,
      reachable4: 14,
      mobility: 160,
      bearAtCenter: -140,
      reachableOuterGateways: -44,
      directBlockers: -150,
      innerRingControl: -95,
      outerEscapes: 55,
      trapReplies: -1500,
      immediateTraps: -1700,
      squeezeReplies: -340,
      trapRoutes: -620,
      squeezeRoutes: -210
    },
    hunters: {
      immediateTraps: 1800,
      trapRoutes: 520,
      squeezeRoutes: 180,
      safeRoutes: -360,
      reachable4: -24,
      mobility: -240,
      trapReplies: -60,
      reachableOuterGatewaysDelta: 220,
      openOuterGatewaysDelta: 80,
      directBlockers: 260,
      innerRingControl: 120,
      outerEscapesDelta: 170,
      bearAtCenter: -120
    }
  },
  search: {
    hardBearLowMobilityDepthBonus: 2,
    hardBearTrapReplyDepthBonus: 1,
    hardHunterLowSafeRoutesDepthBonus: 1
  },
  antiLoop: {
    repetitionBase: 42,
    repetitionRecencyStep: 6,
    moveBacktrackBase: 260,
    moveBacktrackRecencyStep: 40,
    searchBearRepeatBase: 170,
    searchBearRepeatRecencyStep: 28,
    searchBearBacktrackBase: 260,
    responseLoopBase: 960,
    responseLoopRecencyStep: 90
  }
};
