import { TagEditor } from "./TagEditor";
import { Modal } from "./ui/Modal";
import { Button } from "./ui/Button";

interface Props {
  sceneId: string;
  tags: string[];
  onChange: (tags: string[]) => void;
  onClose: () => void;
}

export function TagsDialog({ sceneId, tags, onChange, onClose }: Props) {
  return (
    <Modal
      open
      onClose={onClose}
      title="Tags."
      description="ORGANIZE THIS DOCUMENT"
      size="md"
      footer={
        <Button variant="ghost" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="space-y-4">
        <p className="font-serif italic text-base text-ink-soft">
          Tags help you and your team filter documents on the home page.
        </p>
        <div className="border border-rule bg-paper-deep">
          <TagEditor sceneId={sceneId} tags={tags} onChange={onChange} />
        </div>
      </div>
    </Modal>
  );
}
