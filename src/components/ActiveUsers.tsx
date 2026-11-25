import type { User } from "@/types/whiteboard";

export function ActiveUsers({
  users,
  followingId,
  onSelectUser
}: {
  users: User[];
  followingId?: string | null;
  onSelectUser?: (user: User) => void;
}) {
  return (
    <div className="hidden items-center gap-1 md:flex">
      {users.slice(0, 7).map((user) => {
        const isFollowing = followingId === user.id;
        return (
          <button
            type="button"
            key={user.id}
            onClick={() => onSelectUser?.(user)}
            className={`flex h-9 w-9 items-center justify-center rounded-full border-2 text-xs font-semibold text-white shadow-sm transition ${
              isFollowing ? "border-teal-500 ring-2 ring-teal-400 scale-105" : "border-white hover:scale-105"
            }`}
            style={{ backgroundColor: user.color }}
            title={isFollowing ? `Stop following ${user.name}` : `Follow ${user.name}`}
          >
            {initials(user.name)}
          </button>
        );
      })}
      {users.length > 7 ? (
        <div className="flex h-9 min-w-9 items-center justify-center rounded-full bg-slate-200 px-2 text-xs font-semibold text-slate-700">
          +{users.length - 7}
        </div>
      ) : null}
    </div>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}
