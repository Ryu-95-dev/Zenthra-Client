// Pure helpers that choose JVM options (covered by unit tests).

/** ZGC with generational mode (Java 21+): short pauses, fewer stutters. */
const ZGC = ['-XX:+UseZGC'];
/** Generational ZGC must be requested on Java 21-22; it is the only mode from Java 23 (the flag is then deprecated). */
const ZGC_GENERATIONAL = '-XX:+ZGenerational';

/** G1 tuned for a game client (Java 17-20): young generation sized for Minecraft's many short-lived objects. */
const TUNED_G1 = [
  '-XX:+UseG1GC',
  '-XX:+ParallelRefProcEnabled',
  '-XX:MaxGCPauseMillis=50',
  '-XX:+UnlockExperimentalVMOptions',
  '-XX:G1NewSizePercent=30',
  '-XX:G1MaxNewSizePercent=40',
  '-XX:G1HeapRegionSize=8M',
  '-XX:G1ReservePercent=20',
  '-XX:G1HeapWastePercent=5',
  '-XX:G1MixedGCCountTarget=4',
  '-XX:InitiatingHeapOccupancyPercent=15',
  '-XX:G1MixedGCLiveThresholdPercent=90',
  '-XX:SurvivorRatio=32',
  '-XX:MaxTenuringThreshold=1',
];

export interface JvmFlagOptions {
  /** Major version of the Java runtime (8, 17, 21…), null when unknown. */
  javaMajor: number | null;
  /** The player's own JVM arguments (launcher settings + profile), already split. */
  userArgs: string[];
  /** Class Data Sharing archive to use/create, or null to skip CDS. */
  cdsArchive: string | null;
}

/** The player chose a garbage collector: adding ours would make the JVM refuse to start ("conflicting collector"). */
export function userChoseGc(userArgs: string[]): boolean {
  return userArgs.some((a) => /^-XX:[+-]Use\w*GC$/.test(a));
}

/** The player configured Class Data Sharing themselves (or turned it off). */
export function userConfiguredCds(userArgs: string[]): boolean {
  return userArgs.some((a) => /^-Xshare:|^-XX:(SharedArchiveFile|ArchiveClassesAtExit)=|^-XX:[+-]AutoCreateSharedArchive$/.test(a));
}

/** Java 19+ can create and refresh a dynamic CDS archive by itself (-XX:+AutoCreateSharedArchive). */
export const supportsAutoCds = (javaMajor: number | null) => javaMajor !== null && javaMajor >= 19;

/**
 * Archive paths are handed to the JVM, which on Windows decodes options with the
 * ANSI code page: keep CDS off when the path is not plain ASCII (e.g. accents
 * in the Windows user name) rather than risk a broken path.
 */
export const cdsPathUsable = (p: string) => /^[\x20-\x7e]+$/.test(p);

/**
 * Tuned options placed before the version's own JVM arguments. The player's
 * arguments are added after everything else by the caller, so they win; when
 * they pick a collector or configure CDS, ours are left out to avoid conflicts.
 */
export function tunedJvmFlags(opts: JvmFlagOptions): string[] {
  const out: string[] = [];
  const major = opts.javaMajor;
  if (major !== null && !userChoseGc(opts.userArgs)) {
    if (major >= 21) {
      out.push(...ZGC);
      if (major <= 22) out.push(ZGC_GENERATIONAL);
    } else if (major >= 17) {
      out.push(...TUNED_G1);
    }
  }
  if (opts.cdsArchive && supportsAutoCds(major) && cdsPathUsable(opts.cdsArchive) && !userConfiguredCds(opts.userArgs)) {
    // -Xshare:auto (the default, made explicit): an invalid or outdated archive is
    // ignored and rebuilt when the game exits instead of preventing the launch.
    out.push('-Xshare:auto', `-XX:SharedArchiveFile=${opts.cdsArchive}`, '-XX:+AutoCreateSharedArchive');
  }
  return out;
}

/** Reads the major version from a JDK "release" file (JAVA_VERSION="21.0.3" → 21, "1.8.0_51" → 8). */
export function parseJavaRelease(text: string): number | null {
  const m = /^JAVA_VERSION="?([\d._]+)/m.exec(text);
  if (!m) return null;
  const parts = m[1].split(/[._]/).map((n) => Number.parseInt(n, 10));
  const major = parts[0] === 1 ? parts[1] : parts[0];
  return Number.isFinite(major) && major > 0 ? major : null;
}
