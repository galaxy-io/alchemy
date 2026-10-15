type ProtoEnum<TEnum extends number> = { UNSPECIFIED: TEnum } & Record<string, string | TEnum>;

export const getEnumValues = <TEnum extends number>(enumObject: ProtoEnum<TEnum>) =>
  Object.values(enumObject).filter(
    (value): value is TEnum => typeof value === "number" && value !== enumObject.UNSPECIFIED,
  );

export const mapOptionIdToEnum = <TEnum extends number>(enumObject: ProtoEnum<TEnum>, id: string) =>
  getEnumValues(enumObject).find((value) => value === Number(id)) ?? enumObject.UNSPECIFIED;
