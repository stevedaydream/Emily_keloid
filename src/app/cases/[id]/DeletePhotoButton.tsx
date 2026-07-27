"use client";

import SubmitButton from "@/components/ui/SubmitButton";
import { deletePhotoAction } from "./actions";

export default function DeletePhotoButton({ caseId, photoId }: { caseId: string; photoId: string }) {
  return (
    <form
      action={deletePhotoAction}
      onSubmit={(e) => {
        if (!confirm("確定要刪除這張照片嗎？此動作無法復原。")) e.preventDefault();
      }}
    >
      <input type="hidden" name="case_id" value={caseId} />
      <input type="hidden" name="photo_id" value={photoId} />
      <SubmitButton
        variant="danger"
        size="sm"
        className="!absolute !right-1 !top-1 !h-6 !w-6 !rounded-full !border-0 !bg-black/50 !p-0 !text-white hover:!bg-red-600"
        aria-label="刪除照片"
      >
        ✕
      </SubmitButton>
    </form>
  );
}
