/** bundle id / Team ID 由 CI 注入（PILOTCALC_BUNDLE_ID / PILOTCALC_TEAM_ID），本地回落占位值。 */
module.exports = ({ config }) => {
  const bundleId = process.env.PILOTCALC_BUNDLE_ID || process.env.BUNDLE_ID || (config.ios && config.ios.bundleIdentifier);
  const teamId = process.env.PILOTCALC_TEAM_ID || process.env.TEAM_ID || (config.ios && config.ios.appleTeamId);
  return {
    ...config,
    ios: {
      ...config.ios,
      bundleIdentifier: bundleId,
      ...(teamId ? { appleTeamId: teamId } : {}),
    },
    android: { ...config.android, package: bundleId },
  };
};
