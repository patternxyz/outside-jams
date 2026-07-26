import type { Artist } from "../entities/artist.entity.js";

export class ArtistResponseDto {
  id!: string;
  name!: string;
  spotifyId!: string | null;
  spotifyUrl!: string | null;
  instagramUrl!: string | null;
  youtubeUrl!: string | null;

  static fromEntity(artist: Artist): ArtistResponseDto {
    const dto = new ArtistResponseDto();
    dto.id = artist.id;
    dto.name = artist.name;
    dto.spotifyId = artist.spotifyId;
    dto.spotifyUrl = artist.spotifyUrl;
    dto.instagramUrl = artist.instagramUrl;
    dto.youtubeUrl = artist.youtubeUrl;
    return dto;
  }
}
