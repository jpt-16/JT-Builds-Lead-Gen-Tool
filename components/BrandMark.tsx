import Image from "next/image";

// JT Builds Co logo lockup from jtbuildsco.com.
export function BrandMark({ height = 32 }: { height?: number }) {
  const width = Math.round((574.104 / 224) * height);
  return <Image src="/logo-lockup.svg" alt="JT Builds Co." width={width} height={height} priority unoptimized />;
}
