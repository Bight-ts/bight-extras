module.exports = {
  hooks: {
    readPackage(pkg) {
      const coreSpec = process.env.BIGHT_CORE_PACKAGE_SPEC;

      if (!coreSpec) {
        return pkg;
      }

      for (const field of [
        "dependencies",
        "devDependencies",
        "peerDependencies",
      ]) {
        if (pkg[field] && pkg[field]["@bight-ts/core"]) {
          pkg[field]["@bight-ts/core"] = coreSpec;
        }
      }

      return pkg;
    },
  },
};
