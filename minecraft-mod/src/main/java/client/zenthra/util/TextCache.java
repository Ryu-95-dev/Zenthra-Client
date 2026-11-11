package client.zenthra.util;

/**
 * Remembers the last text a HUD element built and the values it was built
 * from, so the same string is not formatted (and allocated) again on every
 * frame. Used from the render thread only.
 *
 * <pre>
 * if (cache.stale(fps, 0)) cache.set(fps + " FPS");
 * String text = cache.get();
 * </pre>
 */
public final class TextCache {
	private boolean valid;
	private long a, b;
	private String text = "";

	/** True (and remembers the new key) when {@code (a, b)} differs from the key of the cached text. */
	public boolean stale(long a, long b) {
		if (valid && a == this.a && b == this.b) return false;
		this.a = a;
		this.b = b;
		valid = true;
		return true;
	}

	public String get() {
		return text;
	}

	public void set(String text) {
		this.text = text;
	}

	/** Packs two ints into one key without collisions. */
	public static long pack(int high, int low) {
		return ((long) high << 32) | (low & 0xFFFFFFFFL);
	}
}
