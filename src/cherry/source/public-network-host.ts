function parseIpv4(address: string): number[] | null {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return parts;
}

function isPublicIpv4(address: string): boolean {
  const parts = parseIpv4(address);
  if (!parts) return false;
  const [a, b, c] = parts;
  if (a === 0 || a === 10 || a === 127 || a! >= 224) return false;
  if (a === 100 && b! >= 64 && b! <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b! >= 16 && b! <= 31) return false;
  if (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)))) return false;
  if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

function parseIpv6Groups(address: string): number[] | null {
  let normalized = address.toLowerCase().split('%')[0]!;
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(normalized);
  if (dotted) {
    const bytes = parseIpv4(dotted[1]!);
    if (!bytes) return null;
    normalized = normalized.slice(0, dotted.index)
      + ((bytes[0]! << 8) | bytes[1]!).toString(16)
      + ':'
      + ((bytes[2]! << 8) | bytes[3]!).toString(16);
  }
  const halves = normalized.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  if (halves.length === 1 && left.length !== 8) return null;
  const missing = 8 - left.length - right.length;
  if (missing < (halves.length === 2 ? 1 : 0)) return null;
  const rawGroups = [...left, ...Array<string>(missing).fill('0'), ...right];
  if (rawGroups.length !== 8 || rawGroups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null;
  return rawGroups.map((group) => Number.parseInt(group, 16));
}

function isPublicIpv6(address: string): boolean {
  const groups = parseIpv6Groups(address);
  if (!groups) return false;
  const [first, second] = groups;
  if (groups.every((group) => group === 0)) return false;
  if (groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1) return false;
  if (groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff) {
    return isPublicIpv4(`${groups[6]! >> 8}.${groups[6]! & 255}.${groups[7]! >> 8}.${groups[7]! & 255}`);
  }
  // Deprecated IPv4-compatible, NAT64, private, local, multicast, and non-global ranges stay out.
  if (groups.slice(0, 6).every((group) => group === 0)) return false;
  if (first! < 0x2000 || first! > 0x3fff) return false;
  if (first === 0x2001 && [0x0000, 0x0002, 0x0010, 0x0020, 0x0db8].includes(second!)) return false;
  if (first === 0x2002) {
    return isPublicIpv4(`${second! >> 8}.${second! & 255}.${groups[2]! >> 8}.${groups[2]! & 255}`);
  }
  if (first === 0x3fff) return false;
  return true;
}

/** True only for ordinary public DNS names or public literal IP addresses. */
export function isPublicNetworkHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return false;
  if (host.includes(':')) return isPublicIpv6(host);
  if (/^[\d.]+$/.test(host)) return isPublicIpv4(host);
  return true;
}
