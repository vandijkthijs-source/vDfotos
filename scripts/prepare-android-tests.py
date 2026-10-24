#!/usr/bin/env python3
"""Install the release-APK smoke test into a generated Expo Android project."""
from pathlib import Path
import shutil

root = Path(__file__).resolve().parents[1]
gradle = root / 'android/app/build.gradle'
source = gradle.read_text()
if 'testBuildType "release"' not in source:
    source = source.replace('    defaultConfig {', '    testBuildType "release"\n    defaultConfig {', 1)
if 'testInstrumentationRunner "androidx.test.runner.AndroidJUnitRunner"' not in source:
    source = source.replace('    defaultConfig {', '    defaultConfig {\n        testInstrumentationRunner "androidx.test.runner.AndroidJUnitRunner"', 1)
if 'androidTestImplementation "androidx.test:runner:1.6.2"' not in source:
    source = source.replace('dependencies {', '''dependencies {
    androidTestImplementation "androidx.test:runner:1.6.2"
    androidTestImplementation "androidx.test.ext:junit:1.2.1"
    androidTestImplementation "androidx.test.uiautomator:uiautomator:2.3.0"''', 1)
gradle.write_text(source)
target = root / 'android/app/src/androidTest/java/nl/vandijk/immichsort/StartupFlowTest.java'
target.parent.mkdir(parents=True, exist_ok=True)
shutil.copy2(root / 'tests/android/StartupFlowTest.java', target)
print('Android release smoke test prepared.')
