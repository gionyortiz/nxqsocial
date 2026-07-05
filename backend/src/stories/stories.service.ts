import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SafetyService } from '../safety/safety.service';
import { CreateStoryDto } from './stories.dto';

const STORY_ACTIVE_TTL_MS = 24 * 60 * 60 * 1000;

const AUTHOR_SELECT = {
  id: true,
  username: true,
  profile: { select: { displayName: true, avatarUrl: true } },
};

const MEDIA_SELECT = {
  id: true, url: true, thumbnailUrl: true, mimeType: true,
  width: true, height: true, durationSec: true,
};

const STORY_SELECT = {
  id: true, caption: true, visibility: true, status: true,
  expiresAt: true, createdAt: true,
  author: { select: AUTHOR_SELECT },
  media: { select: MEDIA_SELECT },
};

function resolveMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  const apiBase = process.env.API_BASE_URL || 'https://api.nxqsocial.com/api';
  return `${apiBase}${url}`;
}

function mapStory(s: any, viewed: boolean) {
  const { author, media, ...rest } = s;
  const { profile, ...authorBase } = author;
  return {
    ...rest,
    viewed,
    author: { ...authorBase, ...(profile ?? {}) },
    media: media
      ? { ...media, url: resolveMediaUrl(media.url), thumbnailUrl: resolveMediaUrl(media.thumbnailUrl) }
      : null,
  };
}

@Injectable()
export class StoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly safety: SafetyService,
  ) {}

  async createFromAsset(authorId: string, dto: CreateStoryDto) {
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id: dto.mediaId } });
    if (!asset) throw new NotFoundException('Media asset not found');
    if (asset.userId !== authorId) throw new ForbiddenException('Not your media asset');
    if (asset.postId || asset.storyId) {
      throw new BadRequestException('Media asset is already attached');
    }
    if (asset.uploadStatus === 'PENDING') {
      throw new BadRequestException('Upload not confirmed yet — call complete-upload first');
    }
    if (asset.uploadStatus === 'TRANSCODING') {
      throw new BadRequestException('Video is still processing — check status and retry shortly');
    }
    if (asset.uploadStatus === 'REJECTED') {
      throw new BadRequestException('Media was rejected by the safety scanner');
    }

    const captionText = dto.caption ?? '';
    const scanResult = this.safety.scan(captionText);
    const status = scanResult.riskScore >= 50 ? 'UNDER_REVIEW' : 'PUBLISHED';
    const expiresAt = new Date(Date.now() + STORY_ACTIVE_TTL_MS);

    const story = await this.prisma.story.create({
      data: {
        authorId,
        caption: dto.caption,
        visibility: dto.visibility ?? 'PUBLIC',
        status: status as any,
        expiresAt,
        media: { connect: { id: dto.mediaId } },
      },
      select: STORY_SELECT,
    });

    if (!scanResult.safe) {
      this.safety.scanAndPersist('story', story.id, captionText).catch(() => {});
    }

    return { ...mapStory(story, false), underReview: status === 'UNDER_REVIEW' };
  }

  /** Active stories from people the viewer follows, plus their own, grouped by author. */
  async getFeed(viewerId: string) {
    const follows = await this.prisma.follow.findMany({
      where: { followerId: viewerId },
      select: { followingId: true },
    });
    const followingIds = follows.map((f) => f.followingId);

    const stories = await this.prisma.story.findMany({
      where: {
        status: 'PUBLISHED',
        expiresAt: { gt: new Date() },
        OR: [
          { authorId: viewerId },
          { authorId: { in: followingIds }, visibility: { in: ['PUBLIC', 'FOLLOWERS'] } },
        ],
      },
      select: STORY_SELECT,
      orderBy: { createdAt: 'asc' },
    });

    const seen = await this.prisma.storyView.findMany({
      where: { viewerId, storyId: { in: stories.map((s) => s.id) } },
      select: { storyId: true },
    });
    const seenIds = new Set(seen.map((v) => v.storyId));

    const groups = new Map<string, { author: any; hasUnseen: boolean; stories: any[] }>();
    for (const story of stories) {
      const key = story.author.id;
      if (!groups.has(key)) {
        const { profile, ...authorBase } = story.author;
        groups.set(key, { author: { ...authorBase, ...(profile ?? {}) }, hasUnseen: false, stories: [] });
      }
      const group = groups.get(key)!;
      const viewed = seenIds.has(story.id);
      if (!viewed) group.hasUnseen = true;
      group.stories.push(mapStory(story, viewed));
    }

    const authors = Array.from(groups.values());

    authors.sort((a, b) => {
      if (a.author.id === viewerId) return -1;
      if (b.author.id === viewerId) return 1;
      if (a.hasUnseen !== b.hasUnseen) return a.hasUnseen ? -1 : 1;
      const aLatest = a.stories[a.stories.length - 1]?.createdAt ?? 0;
      const bLatest = b.stories[b.stories.length - 1]?.createdAt ?? 0;
      return new Date(bLatest).getTime() - new Date(aLatest).getTime();
    });

    return { authors };
  }

  async getActiveStoriesForUser(username: string, viewerId: string) {
    const author = await this.prisma.user.findUnique({ where: { username } });
    if (!author) throw new NotFoundException('User not found');

    const isSelf = author.id === viewerId;
    const visibility = isSelf ? undefined : { in: ['PUBLIC' as const, 'FOLLOWERS' as const] };

    const stories = await this.prisma.story.findMany({
      where: {
        authorId: author.id,
        status: 'PUBLISHED',
        expiresAt: { gt: new Date() },
        ...(visibility ? { visibility } : {}),
      },
      select: STORY_SELECT,
      orderBy: { createdAt: 'asc' },
    });

    const seen = await this.prisma.storyView.findMany({
      where: { viewerId, storyId: { in: stories.map((s) => s.id) } },
      select: { storyId: true },
    });
    const seenIds = new Set(seen.map((v) => v.storyId));

    return { stories: stories.map((s) => mapStory(s, seenIds.has(s.id))) };
  }

  async recordView(storyId: string, viewerId: string) {
    const story = await this.prisma.story.findUnique({ where: { id: storyId } });
    if (!story) throw new NotFoundException('Story not found');
    if (story.authorId === viewerId) return { viewed: true };

    await this.prisma.storyView.upsert({
      where: { storyId_viewerId: { storyId, viewerId } },
      create: { storyId, viewerId },
      update: {},
    });
    return { viewed: true };
  }

  async deleteOwn(storyId: string, userId: string) {
    const story = await this.prisma.story.findUnique({ where: { id: storyId } });
    if (!story) throw new NotFoundException('Story not found');
    if (story.authorId !== userId) throw new ForbiddenException();
    await this.prisma.story.delete({ where: { id: storyId } });
    return { success: true };
  }
}
