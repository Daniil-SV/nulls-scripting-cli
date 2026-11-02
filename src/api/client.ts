import type { Client, FetchResponse, MaybeOptionalInit } from "openapi-fetch";
import type {
	HttpMethod,
	MediaType,
	PathsWithMethod,
	RequiredKeysOf,
} from "openapi-typescript-helpers";

type InitParam<Init> =
	RequiredKeysOf<Init> extends never
		? [(Init & { [key: string]: unknown })?]
		: [Init & { [key: string]: unknown }];

type UnwrappedMethod<
	Paths extends Record<string, any>,
	Method extends HttpMethod,
> = <
	Path extends PathsWithMethod<Paths, Method>,
	Init extends MaybeOptionalInit<Paths[Path], Method>,
>(
	path: Path,
	...init: InitParam<Init>
) => Promise<
	NonNullable<FetchResponse<Paths[Path][Method], Init, MediaType>["data"]>
>;

export abstract class SafeClient<Paths extends Record<string, any>> {
	protected api!: Client<Paths>;

	protected abstract onFail(
		response: Response,
		data: unknown,
		error: unknown,
	): never;

	protected async unwrap<
		R extends { response: Response; data?: unknown; error?: unknown },
	>(request: Promise<R>): Promise<NonNullable<R["data"]>> {
		const { response, data, error } = await request;
		if (!response.ok || error !== undefined)
			return this.onFail(response, data, error);

		return data as NonNullable<R["data"]>;
	}

	private method<M extends HttpMethod>(verb: M): UnwrappedMethod<Paths, M> {
		return ((path: string, init?: unknown) =>
			this.unwrap(
				(this.api as any)[verb.toUpperCase()](path, init),
			)) as UnwrappedMethod<Paths, M>;
	}

	get = this.method("get");
	post = this.method("post");
	put = this.method("put");
	delete = this.method("delete");
	patch = this.method("patch");
}
