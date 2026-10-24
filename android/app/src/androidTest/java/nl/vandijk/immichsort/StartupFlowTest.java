package nl.vandijk.immichsort;

import android.content.Context;
import android.content.Intent;
import android.graphics.Rect;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.uiautomator.By;
import androidx.test.uiautomator.UiDevice;
import androidx.test.uiautomator.UiObject2;
import androidx.test.uiautomator.UiScrollable;
import androidx.test.uiautomator.UiSelector;
import androidx.test.uiautomator.Until;
import java.io.File;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Exercises the actual standalone release APK, isolated from the real library. */
@RunWith(AndroidJUnit4.class)
public class StartupFlowTest {
  private final UiDevice device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());
  private static final long WAIT = 45000;

  private void click(String label) throws Exception {
    UiObject2 button = device.wait(Until.findObject(By.desc(label)), 5000);
    if (button == null || button.getVisibleBounds().isEmpty()) {
      UiScrollable scroll = new UiScrollable(new UiSelector().scrollable(true));
      if (scroll.exists()) scroll.scrollIntoView(new UiSelector().description(label));
      button = device.wait(Until.findObject(By.desc(label)), WAIT);
    }
    assertNotNull("Missing control: " + label, button);
    button.click();
  }

  private void text(String value) {
    assertTrue("Missing screen text: " + value,
      device.wait(Until.hasObject(By.textContains(value)), WAIT));
  }

  private void swipePhoto(boolean keep) {
    UiObject2 photo = device.wait(Until.findObject(By.desc("Enlarge photo")), WAIT);
    assertNotNull("Photo card did not render", photo);
    Rect r = photo.getVisibleBounds();
    int left = r.left + r.width() * 15 / 100;
    int right = r.left + r.width() * 85 / 100;
    assertTrue(device.swipe(keep ? left : right, r.centerY(), keep ? right : left, r.centerY(), 18));
  }

  @Test public void startsAndSortsSampleWeek() throws Exception {
    Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
    Intent launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
    assertNotNull(launch);
    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
    context.startActivity(launch);

    text("Connect your Immich server");
    click("Try a sample week");
    click("Sort");
    click("Open current week");
    text("6 moments left");
    click("Enlarge photo");
    click("Close photo");
    UiObject2 card = device.wait(Until.findObject(By.desc("Enlarge photo")), WAIT);
    assertNotNull(card);
    Rect bounds = card.getVisibleBounds();
    device.swipe(bounds.centerX(), bounds.bottom - 20, bounds.centerX(), bounds.top + 20, 18);
    click("Select album Family & friends");
    text("5 moments left");
    swipePhoto(false);
    text("4 moments left");
    click("Undo last decision");
    text("5 moments left");
    swipePhoto(true);
    text("4 moments left");
    swipePhoto(false);
    text("3 moments left");
    click("Review decisions (3)");
    click("Apply sample decisions");
    click("Confirm sample");
    text("Demo complete. No real photos were changed.");
    click("Continue sorting");
    text("3 moments left");
    File screenshot = new File(context.getExternalFilesDir(null), "native-sample-flow.png");
    assertTrue("Could not capture native test evidence", device.takeScreenshot(screenshot));
  }
}
