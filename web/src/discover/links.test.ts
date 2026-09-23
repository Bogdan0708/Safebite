import { describe, expect, it } from "vitest";
import { directionsUrl, placeIdUrl, placeUrl } from "./links";

describe("Maps links built from stored fields only", () => {
  it("directions use the Maps URL scheme with the place id as destination", () => {
    expect(directionsUrl("Casa Sem Glúten", "ChIJabc/123")).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=Casa%20Sem%20Gl%C3%BAten&destination_place_id=ChIJabc%2F123",
    );
  });
  it("place pages use the search form with query_place_id", () => {
    expect(placeUrl("Da Marco", "p1")).toBe("https://www.google.com/maps/search/?api=1&query=Da%20Marco&query_place_id=p1");
  });
  it("a place id alone builds a place page by id, with no name", () => {
    expect(placeIdUrl("fixture-01")).toBe("https://www.google.com/maps/place/?q=place_id:fixture-01");
  });
  it("encodes a place id containing reserved characters", () => {
    expect(placeIdUrl("ChIJabc/123")).toBe("https://www.google.com/maps/place/?q=place_id:ChIJabc%2F123");
  });
});
