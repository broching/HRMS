"use client"

import { getErrorMessage } from "@/lib/errors"
import * as React from "react"
import { useMutation } from "convex/react"
import { IconX } from "@tabler/icons-react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { FileUpload } from "@/components/shared/file-upload"
import type { ProfileData } from "./profile-fields"

const MAX_PHOTOS = 10
const MAX_BYTES = 5 * 1024 * 1024 // 5 MB

export function PhotoGallery({ employee }: { employee: ProfileData }) {
  const addPhoto = useMutation(api.employees.addGalleryPhoto)
  const removePhoto = useMutation(api.employees.removeGalleryPhoto)
  const photos = employee.galleryUrls
  // Gallery mutations are self-service only.
  const canEdit = employee.isSelf
  const atCap = photos.length >= MAX_PHOTOS

  async function handleUpload(storageId: Id<"_storage">) {
    try {
      await addPhoto({ storageId })
      toast.success("Photo added")
    } catch (e) {
      toast.error(getErrorMessage(e, "Could not add photo"))
    }
  }

  async function handleRemove(storageId: Id<"_storage">) {
    try {
      await removePhoto({ storageId })
    } catch {
      toast.error("Could not remove photo")
    }
  }

  if (!canEdit && photos.length === 0) return null

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          Photo gallery
          <span className="text-muted-foreground ml-2 text-sm font-normal">
            {photos.length}/{MAX_PHOTOS}
          </span>
        </h2>
        {canEdit && (
          <FileUpload
            accept="image/*"
            label="Add photo"
            disabled={atCap}
            maxBytes={MAX_BYTES}
            onUploaded={handleUpload}
          />
        )}
      </div>

      {photos.length > 0 ? (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
          {photos.map((p) => (
            <div
              key={p.storageId}
              className="group bg-muted relative aspect-square overflow-hidden rounded-lg"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.url}
                alt="Gallery photo"
                className="size-full object-cover"
              />
              {canEdit && (
                <button
                  type="button"
                  onClick={() => handleRemove(p.storageId)}
                  className="bg-background/80 text-foreground absolute right-1 top-1 rounded-full p-1 opacity-0 shadow transition-opacity group-hover:opacity-100"
                >
                  <IconX className="size-3.5" />
                  <span className="sr-only">Remove photo</span>
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          Add up to {MAX_PHOTOS} photos (max 5 MB each).
        </p>
      )}
    </section>
  )
}
