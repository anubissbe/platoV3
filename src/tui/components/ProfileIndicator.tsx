import React from "react";
import { Box, Text } from "ink";
import { Profile } from "../../permissions/types.js";

export interface ProfileIndicatorProps {
  currentProfile: Profile | null;
  isActive: boolean;
  onClick?: () => void;
}

export const ProfileIndicator: React.FC<ProfileIndicatorProps> = ({
  currentProfile,
  isActive,
  onClick,
}) => {
  if (!currentProfile) {
    return (
      <Box>
        <Text color="gray" dimColor>
          No Profile
        </Text>
      </Box>
    );
  }

  // Determine colors based on profile type and status
  const getProfileColors = () => {
    if (!isActive) {
      return { color: "gray", backgroundColor: undefined };
    }

    // Color coding based on profile name/type
    switch (currentProfile.name.toLowerCase()) {
      case "production":
      case "prod":
        return { color: "red", backgroundColor: "redBright" };
      case "staging":
      case "stage":
        return { color: "yellow", backgroundColor: "yellowBright" };
      case "development":
      case "dev":
      case "develop":
        return { color: "green", backgroundColor: "greenBright" };
      case "testing":
      case "test":
        return { color: "blue", backgroundColor: "blueBright" };
      default:
        return { color: "cyan", backgroundColor: "cyanBright" };
    }
  };

  const { color, backgroundColor } = getProfileColors();
  const displayName = currentProfile.name.toUpperCase();
  const restrictionLevel = getRestrictionLevel(currentProfile);

  return (
    <Box borderStyle="round" borderColor={color} paddingX={1}>
      <Box marginRight={1}>
        <Text color={color} bold>
          {displayName}
        </Text>
      </Box>
      <Box>
        <Text color={color} dimColor>
          [{restrictionLevel}]
        </Text>
      </Box>
      {currentProfile.activationScore && (
        <Box marginLeft={1}>
          <Text color="gray" dimColor>
            ({Math.round(currentProfile.activationScore)}%)
          </Text>
        </Box>
      )}
      <Box marginLeft={1}>
        <Text color="gray" dimColor>
          Press Ctrl+P to switch
        </Text>
      </Box>
    </Box>
  );
};

/**
 * Determine restriction level based on profile defaults
 */
function getRestrictionLevel(profile: Profile): string {
  const defaults = profile.defaults;
  const restrictiveCount = Object.values(defaults).filter(
    (action) => action === "deny",
  ).length;
  const totalActions = Object.values(defaults).length;

  if (totalActions === 0) return "UNKNOWN";

  const restrictionRatio = restrictiveCount / totalActions;

  if (restrictionRatio >= 0.8) return "STRICT";
  if (restrictionRatio >= 0.5) return "MODERATE";
  if (restrictionRatio >= 0.2) return "RELAXED";
  return "PERMISSIVE";
}

export default ProfileIndicator;
