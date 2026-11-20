"use client";

import Image from "next/image";
import { useState } from "react";

export function AccountAvatar({ image, name }: { image: string | null; name: string }) {
  const [failed, setFailed] = useState<string | null>(null);

  return (
    <span
      aria-hidden="true"
      className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-[#dfedb4] text-3xl font-semibold text-[#293320]"
    >
      {image && failed !== image ? (
        <Image
          src={image}
          alt=""
          width={56}
          height={56}
          unoptimized
          className="size-full object-cover"
          onError={() => setFailed(image)}
        />
      ) : (
        Array.from(name)[0]?.toUpperCase()
      )}
    </span>
  );
}
