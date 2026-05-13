"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";
import { updateAvatarAction } from "@/actions/auth";

const TARGET = 256; // px - resize square
const QUALITY = 0.85;

async function compressToDataUri(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const size = TARGET;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  // Cover-crop center square
  const min = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - min) / 2;
  const sy = (bitmap.height - min) / 2;
  ctx.drawImage(bitmap, sx, sy, min, min, 0, 0, size, size);
  return canvas.toDataURL("image/jpeg", QUALITY);
}

export function AvatarUploader({
  initial,
  name,
}: {
  initial?: string | null;
  name: string;
}) {
  const [avatar, setAvatar] = useState<string | null>(initial ?? null);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const onPick = () => fileRef.current?.click();

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      toast.error("Pick an image file");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("File too large (max 8 MB before compression)");
      return;
    }
    try {
      const dataUri = await compressToDataUri(file);
      if (dataUri.length > 96 * 1024) {
        toast.error("Compressed image still too large");
        return;
      }
      start(async () => {
        const res = await updateAvatarAction(dataUri);
        if (res.ok) {
          setAvatar(dataUri);
          toast.success("Profile picture updated");
        } else {
          toast.error(res.error);
        }
      });
    } catch {
      toast.error("Could not process image");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const onRemove = () => {
    start(async () => {
      const res = await updateAvatarAction(null);
      if (res.ok) {
        setAvatar(null);
        toast.success("Profile picture removed");
      } else {
        toast.error(res.error);
      }
    });
  };

  return (
    <div className="flex items-center gap-4">
      <UserAvatar src={avatar} name={name} size={72} className="ring-1 ring-border" />
      <div className="flex flex-col gap-2 min-w-0">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            onClick={onPick}
            disabled={pending}
            loading={pending}
          >
            {avatar ? "Change" : "Upload photo"}
          </Button>
          {avatar && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onRemove}
              disabled={pending}
            >
              Remove
            </Button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onFile}
        />
      </div>
    </div>
  );
}
