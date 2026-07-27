import type { Artist, ArtistImage } from "../entities/artist.entity.js";

export class ArtistResponseDto {
  id!: string;
  name!: string;
  spotifyId!: string | null;
  spotifyUrl!: string | null;
  instagramUrl!: string | null;
  youtubeUrl!: string | null;
  images!: ArtistImage[] | null;

  static fromEntity(artist: Artist): ArtistResponseDto {
    const dto = new ArtistResponseDto();
    dto.id = artist.id;
    dto.name = artist.name;
    dto.spotifyId = artist.spotifyId;
    dto.spotifyUrl = artist.spotifyUrl;
    dto.instagramUrl = artist.instagramUrl;
    dto.youtubeUrl = artist.youtubeUrl;
    dto.images = artist.images;
    return dto;
  }
}
