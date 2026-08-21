const { withGradleProperties } = require("expo/config-plugins");

const GRADLE_PROPERTIES = {
  "org.gradle.caching": "true",
  "org.gradle.jvmargs": "-Xmx4096m -XX:MaxMetaspaceSize=1024m",
};

module.exports = function withGradleTuning(config) {
  return withGradleProperties(config, (config) => {
    for (const [key, value] of Object.entries(GRADLE_PROPERTIES)) {
      const item = config.modResults.find(
        (p) => p.type === "property" && p.key === key,
      );
      if (item) {
        item.value = value;
      } else {
        config.modResults.push({ type: "property", key, value });
      }
    }
    return config;
  });
};
