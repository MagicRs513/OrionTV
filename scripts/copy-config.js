const fs = require('fs');
const path = require('path');

const xmlDir = path.join(__dirname, '..', 'xml');
const androidAppSrcDir = path.join(__dirname, '..', 'android', 'app', 'src');
const androidSettingsGradle = path.join(__dirname, '..', 'android', 'settings.gradle');

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  if (!exists) {
    console.log(`Source directory ${src} does not exist, skipping copy.`);
    return;
  }
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();
  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursiveSync(
        path.join(src, childItemName),
        path.join(dest, childItemName)
      );
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

function fixSettingsGradle() {
  if (!fs.existsSync(androidSettingsGradle)) {
    console.log('settings.gradle not found, skipping fix.');
    return;
  }

  let content = fs.readFileSync(androidSettingsGradle, 'utf8');
  
  const fixedContent = `pluginManagement {
  includeBuild(new File(["node", "--print", "require.resolve('@react-native/gradle-plugin/package.json')"].execute(null, rootDir).text.trim()).getParentFile().toString())
}

plugins { id("com.facebook.react.settings") }

extensions.configure(com.facebook.react.ReactSettingsExtension) { ex ->
  def command = [
    'node',
    '--no-warnings',
    '--eval',
    'require(require.resolve(\\'expo-modules-autolinking\\', { paths: [require.resolve(\\'expo/package.json\\')] }))(process.argv.slice(1))',
    'react-native-config',
    '--json',
    '--platform',
    'android'
  ].toList()
  ex.autolinkLibrariesFromCommand(command)
}

rootProject.name = 'OrionTV'

dependencyResolutionManagement {
  versionCatalogs {
    reactAndroidLibs {
      from(files(new File(["node", "--print", "require.resolve('react-native/package.json')"].execute(null, rootDir).text.trim(), "../gradle/libs.versions.toml")))
    }
  }
}

apply from: new File(["node", "--print", "require.resolve('expo/package.json')"].execute(null, rootDir).text.trim(), "../scripts/autolinking.gradle");
useExpoModules()

apply from: new File(["node", "--print", "require.resolve('@react-native-community/cli-platform-android/package.json', { paths: [require.resolve('react-native/package.json')] })"].execute(null, rootDir).text.trim(), "../native_modules.gradle");
applyNativeModulesSettingsGradle(settings)

include ':app'
includeBuild(new File(["node", "--print", "require.resolve('@react-native/gradle-plugin/package.json', { paths: [require.resolve('react-native/package.json')] })"].execute(null, rootDir).text.trim()).getParentFile())
`;

  if (content !== fixedContent) {
    fs.writeFileSync(androidSettingsGradle, fixedContent, 'utf8');
    console.log('Fixed settings.gradle for Windows compatibility.');
  }
}

console.log('Copying XML configurations to Android project...');
copyRecursiveSync(xmlDir, androidAppSrcDir);
console.log('Done!');

fixSettingsGradle();
