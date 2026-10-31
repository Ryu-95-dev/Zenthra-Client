package client.zenthra.compat;

import java.util.function.Supplier;

/** A vanilla video option shown in the in-game "Performance" view; clicking cycles its value. */
public record PerfOption(String label, Supplier<String> value, Runnable next) {}
