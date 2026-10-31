package client.zenthra.util;

import java.util.ArrayDeque;

/** Counts real mouse clicks over the last second (fed by MouseHandlerMixin). */
public final class CpsTracker {
	private static final ArrayDeque<Long> LEFT = new ArrayDeque<>();
	private static final ArrayDeque<Long> RIGHT = new ArrayDeque<>();

	private CpsTracker() {}

	public static void onClick(int button) {
		long now = System.currentTimeMillis();
		if (button == 0) LEFT.addLast(now);
		else if (button == 1) RIGHT.addLast(now);
	}

	public static int left() {
		return count(LEFT);
	}

	public static int right() {
		return count(RIGHT);
	}

	private static int count(ArrayDeque<Long> q) {
		long limit = System.currentTimeMillis() - 1000;
		while (!q.isEmpty() && q.peekFirst() < limit) q.pollFirst();
		return q.size();
	}
}
